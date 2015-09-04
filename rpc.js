// node.js library for Exosite One Platform
//
'use strict';
var _ = require('underscore');
var async = require('async');
var util = require('util');
var request = require('request');

var OPTIONS = {
  host: 'm2.exosite.com',
  path: '/api:v1/rpc/process',
  agent: 'node-onep',
  https: true,
  strictSSL: true
};

function jstr(value, replacer, space) {
  return JSON.stringify(value, replacer, space);
}

/**
 * Split array a into chunks of at most size N
 * Destroys a and returns array of chunks, e.g. 
 * [n1, n2, n3, n4, n5] => [[n1, n2], [n3, n4], [n5]]
 */
function chunkArray(a, size) {
  var arrays = [];
  while (a.length > 0) {
    arrays.push(a.splice(0, size));
  }
  return arrays;
}
 
exports.setOptions = function(options) {
  _.extend(OPTIONS, options);
};

/**
 * Make a single RPC call
 */
exports.call = function(auth, procedure, args, callback) {
  exports.callMulti(
    auth, 
    [{procedure: procedure, arguments: args}], 
    callback);
};

/**
 * Make multiple calls in one RPC request
 */
exports.callMulti = function(auth, calls, callback) {
  var protocol = OPTIONS.https ? 'https://' : 'http://';
  var port = OPTIONS.hasOwnProperty('port') ? OPTIONS.port : OPTIONS.https ? 443 : 80;
  if (typeof auth === 'string') {
    auth = {'cik': auth};
  }

  var bodyobj = {
    calls: [],
    auth: auth
  };
  for (var i = 0; i < calls.length; i++) {
    var call = calls[i];
    bodyobj.calls.push({
      id: i,
      procedure: call.procedure,
      arguments: call.arguments});
  }
  var body = JSON.stringify(bodyobj);
  var options = {
    uri: protocol + OPTIONS.host + ':' + port + OPTIONS.path,
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'user-agent': OPTIONS.agent
    },
    body: body,
    strictSSL: OPTIONS.strictSSL
  };
  if (OPTIONS.hasOwnProperty('timeout')) {
    options.timeout = OPTIONS.timeout;
  }
  
  request(options, function (error, response, body) {
    if (error !== null) {
      callback(error);
      return;
    }
    if (response.statusCode !== 200) {
      callback("Status " + response.statusCode + ": " + body);
    } else if (body.length === 0) {
      callback("Empty response body", null);
    } else {
      var obj = JSON.parse(body);
      if (!Array.isArray(obj)) {
        callback('General RPC error: ' + JSON.stringify(obj.error), obj, response);
      } else {
        var responses = [];
        var i;
        for (i = 0; i < calls.length; i++) {
          responses.push(null);
        }
        for (i = 0; i < obj.length; i++) {
          var id = obj[i].id;
          delete response.id;
          responses[id] = obj[i];
        } 
        callback(null, responses, response);
      }
    }
  });
};

/**
 * Returns a new Error object if there was a general
 * error in rpcresponse, or null if there
 * is no such error.
 */
exports.generalError = function(rpcresponse) {
  if (rpcresponse.hasOwnProperty('error')) {
    return new Error(JSON.stringify(rpcresponse.error));
  }
  return null;
};

/**
 * Returns a new Error object if there was a general
 * or specific error in rpcresponse, or null if there
 * is no error.
 */
exports.error = function(rpcresponse) {
  var generalError = exports.generalError(rpcresponse);
  if (generalError) {
    return generalError;
  }
  for (var i = 0; i < rpcresponse.length; i++) {
    var response = rpcresponse[i];
    if (response.status !== 'ok') {
      return new Error(JSON.stringify(rpcresponse));
    }
  }
  return null;
};

/**
 * Walk the tree of a client and its descendant resources.
 *
 * result looks like this: 
 * [{
 *   rid: "01234...", 
 *   children: [{
 *     rid: "23456...", 
 *     status: 'locked'
 *     }]
 *  }, 
 *  {
 *    rid: "12345..."
 *  }]
 * options are:
 *   depth  stop at a given depth from the root client (if 
 *          omitted, depth is not limited)
 *   visit  function to call as each resource is visited. 
 *          Takes rid, type, and depth parameters.
 *   info   Object describing info to be read for each resource
 *          visited and put in the info key, or null to not read.
 *          It may also be a function called with rid, type, depth.
 *          Takes rid, type, and depth parameters.
 *   types  list of type strings. Options are "dataport", 
 *          "datarule", "dispatch". If omitted, visits only clients.
 * callback  takes err, tree
 */
exports.tree = function(auth, options, callback) {
  if (options.hasOwnProperty('types')) {
    options = _.extend({}, options);
    var types = ['client'];
    for (var i = 0; i < options.types.length; i++) {
      if (options.types[i] !== 'client') {
        types.push(options.types[i]);
      }
    }
    options.types = types;
  }
  _tree(auth, options, 0, null, [], function(err, tree, infoRequests) {
    if (err) {
      return callback(err);
    }
    if (infoRequests.length === 0) {
      return callback(null, tree);
    }
    exports.batch(auth, infoRequests, {}, function(err, responses) {
      var info = {};
      //console.log(JSON.stringify(infoRequests));
      _.each(responses, function(response, i) {
        if (typeof response === 'undefined') {
          var msg = 'response ' + i + ' of ' + responses.length + ' is undefined.';
          info[infoRequests[i].arguments[0]] = {error: msg};
          process.stderr.write(msg);
        } else {
          if (response.status === 'ok') {
            info[infoRequests[i].arguments[0]] = response.result;
          } else {
            info[infoRequests[i].arguments[0]] = {error: response};
          }
        }
      });
      exports.walk(tree, 
        function(resource, depth, parentRid) {
          if (resource.rid in info) {
            resource.info = info[resource.rid];
          }
        });
      callback(null, tree);
    });
  });
};

/**
 * Walks the tree object that is the result of tree(),
 * calling visit(tree, depth, parentRID) on each resource and expecting
 * calling callback(err, tree) when the visit is complete.
 * For the root resource, parentRID is undefined.
 */
exports.walk = function(tree, visit) {
  var depth = 0;
  var gen = [{res: tree}];
  var nextgen = [];
  while (gen.length > 0) {
    for (var i = 0; i < gen.length; i++) {
      visit(gen[i].res, depth, gen[i].par);      
      if (_.has(gen[i].res, 'children')) {
        for (var j = 0; j < gen[i].res.children.length; j++) {
          nextgen.push({res: gen[i].res.children[j], par: gen[i].res.rid});
        }
      }
    }
    gen = nextgen;
    nextgen = [];
    depth += 1;
  }
};

/**
 * Call multiple RPC procedures and callback with an error if there's a
 * general error or if any procedure response is not OK. Returns
 * array of results if all OK.
 * calls is an abbreviated form [<proc-string>, <arg-array>] rather than
 * {procedure: <proc-string>, arguments: <arg-array>}
 */
function callMultiOK(auth, calls, callback) {
  calls = _.map(calls, function(c) {
    return {procedure: c[0], arguments: c[1]};
  });
  exports.callMulti(auth, calls,  
    function(err, rpcresponse, httpresponse) {
      if (err) {
        return callback(err);
      }
      err = exports.error(rpcresponse);
      if (err) {
        return callback({error: err.toString()});
      }
      callback(null, _.pluck(rpcresponse, 'result'));
    });
}

// handle listing single client and call back
function _tree(auth, options, depth, client_rid, infoRequests, callback) {
  if (_.isString(auth)) {
    auth = {cik: auth};
  }
  if (client_rid !== null) {
    auth.client_id = client_rid;
  }
  var types = options.hasOwnProperty('types') ? options.types : ['client'];

  // helper functions
  // this defines how a tree resource looks
  function makeResource(rid, type, children, info) {
    var resource = {rid: rid, type: type};
    if (typeof children !== 'undefined' && children !== null) {
      resource.children = children;
    }
    if (typeof info !== 'undefined' && info !== null) {
      resource.info = info;
    } 
    return resource;
  }
  
  // Determine whether we should do an RPC info
  // call for a resource. If so, returns info options.
  // If not, returns null.
  function getInfo(rid, type, depth) {
    var info = null; 
    if (options.hasOwnProperty('info')) {
      if (_.isFunction(options.info)) {
        info = options.info(rid, type, depth);
      } else {
        info = options.info;
      }
    } 
    return info;
  }
  
  // Visit a resource, and add to
  // the list of info requests to make in batch later
  function visit(rid, type, depth) {
    var visitFn = options.visit || null;
    if (visitFn !== null) {
      visitFn(rid, type, depth);
    }
  }

  // Visit a resource and then add an info 
  // call to be made later, if necessary.
  function visitAndQueue(rid, type, depth) {
    visit(rid, type, depth);
    var info = getInfo(rid, type, depth);
    if (info !== null) {
      infoRequests.push({procedure: 'info', arguments: [rid, info]}); 
    }
  }

  var rid = client_rid;

  // if we've reached depth and already have
  // an rid, we don't need to make RPC calls 
  if (depth === options.depth && rid !== null) {
    visitAndQueue(rid, 'client', depth);
    return callback(null, makeResource(rid, 'client'), infoRequests);
  }

  // Otherwise, we need to figure out what calls to make
  var calls = [];
  if (depth !== options.depth) {
    // we're not yet at depth, so do a listing
    calls.push(['listing', [types, {}]]);
  }
  if (rid === null) {
    // rid is unknown, so look it up
    calls.push(['lookup', ['alias', '']]);
  } else {
    // if we need info for this node, piggy-back an info procedure
    // call on this RPC request instead of queuing it at the end.
    var infoOptions = getInfo(rid, 'client', depth);
    if (infoOptions !== null) {
      calls.push(['info', [rid, infoOptions]]);
    }
  }

  callMultiOK(
    auth,
    calls,
    function(err, results) {
      if (err) {
        return callback(err);
      }

      var callProcs = _.map(calls, function(c) { return c[0]; });
      var lookupIdx = callProcs.indexOf('lookup');
      if (lookupIdx !== -1) {
        // root RID lookup
        rid = results[lookupIdx];
      }
      var infoIdx = callProcs.indexOf('info');
      var clientInfo = null; 
      if (infoIdx !== -1) {
        clientInfo = results[infoIdx];
        // visit without queuing a call for info
        visit(rid, 'client', depth);
      } else {
        // info was not called yet because we didn't have
        // the RID available to determine if it needed
        // to be called.
        visitAndQueue(rid, 'client', depth);
      }

      var listingIdx = callProcs.indexOf('listing');
      if (listingIdx === -1) {
        return callback(null, makeResource(rid, 'client', null, clientInfo), infoRequests);
      }

      var all_rids = results[listingIdx];
      var resources = [];
      _.each(types, function(type) {
        _.each(all_rids[type], function(rid) {
          resources.push(makeResource(rid, type));
        });
      });

      // add tree to each resource
      var limitConcurrent = 10;
      async.mapLimit(resources, limitConcurrent, function(resource, mapLimitCallback) {
        if (resource.type === 'client') {
          // resource is a client
          _tree(auth, options, depth + 1, resource.rid, infoRequests, function(err, tree) {
            if (err) {
              if (_.isObject(err)) {
                // if status from listing call is not ok, add status to resource
                // this is to handle, e.g., status: "locked"
                _.extend(resource, err);
                mapLimitCallback(null, resource);
              } else {
                mapLimitCallback(err);
              }
              return;
            }
            // only include tree if the client has children
            // (or if it's not null, which signals that depth 
            // limit was reached)
            if (tree !== null) {
              _.extend(resource, tree);
            }
            mapLimitCallback(null, resource);
          });
        } else {
          // non-clients get visited but don't get a recursive call
          visitAndQueue(resource.rid, resource.type, depth + 1);
          mapLimitCallback(null, resource);
        }
      },
      function(err, children) {
        if (err) {
          return callback(err);
        }
        callback(null, makeResource(rid, 'client', children, clientInfo), infoRequests);
      });
    }
  );
}
 
/**
 * Make a lot of RPC calls, splitting the calls into evenly
 * sized chunks and calling in parallel.
 *
 * auth   RPC auth object
 * calls  an array of call objects like this:
 *        {procedure: <procedure>, arguments: <args>}
 */
exports.batch = function(auth, calls, options, callback) {
  // batch calls into chunks to reduce the number of HTTP requests we have to make
  var chunkSize = options.chunkSize || 5;
  var parallelLimit = options.parallelLimit || 10;
  var verbose = options.verbose || false;
  // chunkArray modifies the original array
  calls = _.map(calls, function(x) { return x; });
  var rpcCallChunks = chunkArray(calls, chunkSize);
  var msg = '';
  // assemble RPC request chunks into functions for async.parallelLimit
  var rpcRequests = _.map(rpcCallChunks, function(chunk, i) {
    return function(mapReqCallback) {
      var responses = [];
      exports.callMulti(
        auth,
        chunk,
        function(err, rpcresponse, httpresponse) {
          if (err) {
            msg = 'Overall RPC error in batch() ' + 
              ': err is ' + err + ' rpcresponse is ' + JSON.stringify(rpcresponse) + 
              ' request was ' + JSON.stringify(_.pluck(chunk, 'call'));
            return mapReqCallback(new Error(msg));
          } 
          for (var i = 0; i < rpcresponse.length; i++) {
            if (rpcresponse[i].status !== 'ok') {
              msg = 'Error ' + JSON.stringify(chunk[i].call) + 
                  ' => ' + JSON.stringify(rpcresponse[i]) + '\n';
              if (verbose) {
                process.stderr.write(msg);
              }
            }
            responses.push(rpcresponse[i]);
          }
          mapReqCallback(null, responses);
        });
      };
  });
 
  async.parallelLimit(rpcRequests, parallelLimit, function(err, responses) {
    callback(err, _.flatten(responses));
  });
};

// check that an object has only specified keys
function hasOnly(obj, keys, valid) {
  return _.every(_.keys(obj), function(k) { 
    return keys.indexOf(k) !== -1 && (valid ? valid(k) : true);
  });
}
// check that every object in a list satisfies hasOnly()
function listHasOnly(list, subkeys, valid, validObj) {
  return _.every(list, function(o) {
    return hasOnly(o, subkeys, valid) && (validObj ? validObj(o) : true);
  });
} 


/**
 * General error/no error callback
 * @callback specCallback
 * @param {object} error - Error instance
 * @param {object} rids - arrays of rids in "dataports", "scripts", 
 *                        and "clients" in the same order they occur 
 *                        in the spec.
 */

/** 
 * Create dataports and scripts for a client
 *  based on a subset of Exoline spec: 
 *  https://github.com/exosite/exoline#spec
 * 
 * Supported spec subset:
 *  dataports: alias, format, unit, name, initial
 *  scripts: alias, code, name
 * Additional capabilities beyond Exoline's spec:
 *  clients: alias, name, description
 *
 * @param {object} auth - auth param, e.g. {cik: "123..."} or just a string cik.
 * @param {object} spec - what dataports and scripts to create in the
 *                        client refererenced by auth. May contain
 *                        "dataports" and "scripts" keys which contain lists
 *                        of dataport, script, and client` spec objects, 
 *                        respectively.  E.g., to create one dataport and one 
 *                        script, pass:
 *                        {
 *                          dataports: [{alias: temp_c, format: float, initial: 22}],
 *                          scripts: [{alias: hello, code: "debug('Hello, World!')"}] 
 *                        } 
 *                        Note that unlike Exoline spec, no validation is
 *                        done. It's just reusing the spec format to make it
 *                        easier to create devices.
 *
 * @param {errCallback) callback - whether or not there was an error 
 */
exports.createFromSpec = function(auth, spec, callback) {

  var supportBaseKeys = ['dataports', 'scripts', 'clients'];
  if (!hasOnly(spec, supportBaseKeys, 
      function(k) { return _.isArray(spec[k]); })) {
    return callback(new Error("spec base keys should be in " + jstr(supportBaseKeys) + " and be arrays."));
  }

  // validate dataports
  var supportDataportKeys = ['alias', 'format', 'name', 'initial'];
  var dataports = _.has(spec, 'dataports') ? spec.dataports : [];
  if (!listHasOnly(dataports, supportDataportKeys, null,
    function(o) { return _.has(o, 'alias'); })) {
    return callback(new Error("spec dataports must have key \"alias\" and may only have these: " + jstr(supportDataportKeys)));
  }
   
  // validate scripts
  var supportScriptKeys = ['alias', 'code', 'name'];
  var scripts = _.has(spec, 'scripts') ? spec.scripts: [];
  if (!listHasOnly(scripts, supportScriptKeys, null,
      function(o) { return _.has(o, 'alias') && _.has(o, 'code'); })) {
    return callback(new Error("spec scripts must have \"alias\" and \"code\" and may only have these: " + jstr(supportScriptKeys)));
  }

  // validate clients
  var supportClientKeys = ['name', 'alias', 'description'];
  var clients = _.has(spec, 'clients') ? spec.clients: [];
  if (!listHasOnly(clients, supportClientKeys, null, null)) {
    return callback(new Error("spec clients may only have these: " + jstr(supportClientKeys)));
  }


  // first, create all the dataports and scripts
  var calls = [];
  _.each(dataports, function(dp) {
    var desc = {
      retention: {
        count: "infinity",
        duration: "infinity"
      }
    };
    desc.format = _.has(dp, 'format') ? dp.format : 'string';
    if (_.has(dp, 'name')) {
      desc.name = dp.name;
    }
    calls.push(['create', ['dataport', desc]]);
  });
  _.each(scripts, function(script) {
    var desc = {
      format: 'string',
      name: _.has(script, 'name') ? script.name : script.alias,
      preprocess: [],
      rule: {
        script: script.code 
      },
      visibility: 'parent',
      retention: {
        count: 'infinity',
        duration: 'infinity'
      }
    };
    calls.push(['create', ['datarule', desc]]);
  });
  _.each(clients, function(client) {
    var desc = _.has(client, 'description') ? client.description : {
      limits: {
        client: 'inherit',
        dataport: 'inherit',
        datarule: 'inherit',
        disk: 'inherit',
        dispatch: 'inherit',
        email: 'inherit',
        email_bucket: 'inherit',
        http: 'inherit',
        http_bucket: 'inherit',
        share: 'inherit',
        sms: 'inherit',
        sms_bucket: 'inherit',
        xmpp: 'inherit',
        xmpp_bucket: 'inherit'},
    };
    if (_.has(client, 'name')) {
      desc.name = client.name;
    }
    calls.push(['create', ['client', desc]]);
  });
  var allResources = dataports.concat(scripts).concat(clients);
  callMultiOK(auth, calls, function(err, results) {
    if (err) {
      return callback(err);
    }
    var rids = results;

    // second, map aliases and write any initial values
    calls = [];
    _.each(rids, function(rid, i) {
      if (_.has(allResources[i], 'alias')) {
        calls.push(['map', ['alias', rid, allResources[i].alias]]);
      }
      if (_.has(allResources[i], 'initial')) {
        calls.push(['write', [rid, allResources[i].initial]]);
      }
    }); 
    callMultiOK(auth, calls, function(err, results) {
      if (err) {
        return callback(err);
      }
      var specResponse = {
        dataports: [],
        scripts: [],
        clients: []
      };
      var i = 0;
      _.each(dataports, function(dp) {
        specResponse.dataports.push(rids[i]);
        i++;
      });      
      _.each(scripts, function(script) {
        specResponse.scripts.push(rids[i]);
        i++;
      });
      _.each(clients, function(client) {
        specResponse.clients.push(rids[i]);
        i++;
      });
      callback(null, specResponse);
    });
  });
};
