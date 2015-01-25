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
  https: false
};

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
    body: body
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
        function(resource, depth) {
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
 * calling visit(tree, depth) on each resource and expecting
 * calling callback(err, tree) when the visit is complete.
 */
exports.walk = function(tree, visit) {
  _walk(tree, visit, 0);
};

function _walk(tree, visit, depth) {
  visit(tree, depth);
  if (tree.hasOwnProperty('children')) {
    for (var i = 0; i < tree.children.length; i++) {
      _walk(tree.children[i], visit, depth + 1);
    }
  }
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
  function makeResource(rid, type, children) {
    var resource = {rid: rid, type: type};
    if (typeof children !== 'undefined') {
      resource.children = children;
    }
    return resource;
  }
  // visit a resource, and add to
  // the list of info requests to make in batch later
  function visit(rid, type, depth) {
    var visitFn = options.visit || null;
    if (visitFn !== null) {
      visitFn(rid, type, depth);
    }
    if (options.hasOwnProperty('info')) {
      var info = null; 
      if (_.isFunction(options.info)) {
        info = options.info(rid, type, depth);
      } else {
        info = options.info;
      }
      if (info !== null) {
        infoRequests.push({procedure: 'info', arguments: [rid, info]}); 
      }
    }
  }

  var rid = client_rid;

  // if we've reached depth and already have
  // an rid, we don't need to make RPC calls 
  if (depth === options.depth && rid !== null) {
    visit(rid, 'client', depth);
    return callback(null, makeResource(rid, 'client'), infoRequests);
  }

  // Otherwise, we need to figure out what calls to make
  var calls = [];
  if (depth !== options.depth) {
    // we're not yet at depth, so do a listing
    calls.push({procedure: 'listing', arguments: [types, {}]});
  }
  if (rid === null) {
    // rid is unknown, so look it up
    calls.push({procedure: 'lookup', arguments: ['alias', '']});
  }

  exports.callMulti(
    auth,
    calls,
    function(err, rpcresponse, httpresponse) {
      if (err) {
        return callback(err);
      }
      err = exports.error(rpcresponse);
      if (err) {
        return callback({error: err.toString()});
      }
      var lookupIdx = _.pluck(calls, 'procedure').indexOf('lookup');
      if (lookupIdx !== -1) {
        // root RID lookup
        rid = rpcresponse[lookupIdx].result;
      }
      visit(rid, 'client', depth);
      var listingIdx = _.pluck(calls, 'procedure').indexOf('listing');

      if (listingIdx === -1) {
        return callback(null, makeResource(rid, 'client'), infoRequests);
      }

      var all_rids = rpcresponse[listingIdx].result;
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
          visit(resource.rid, resource.type, depth + 1);
          mapLimitCallback(null, resource);
        }
      },
      function(err, children) {
        if (err) {
          return callback(err);
        }
        callback(null, makeResource(rid, 'client', children), infoRequests);
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
