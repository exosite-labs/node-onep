// node.js library for Exosite One Platform
//
'use strict'
var _ = require('underscore');

var OPTIONS = {
  host: 'm2.exosite.com',
  path: '/api:v1/rpc/process',
  agent: 'node-onep',
  https: false 
}

exports.setOptions = function(options) {
  _.extend(OPTIONS, options);
}

exports.call = function(auth, procedure, args, callback) {
  exports.callMulti(auth, 
                    [{procedure: procedure, arguments: args}], 
                    callback);
}

exports.callMulti = function(auth, calls, callback) {
  var request = require('request')
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
    bodyobj.calls.push({id: i,
                        procedure: call.procedure,
                        arguments: call.arguments});
  }
  var body = JSON.stringify(bodyobj);
  var options = {
    uri: protocol + OPTIONS.host + OPTIONS.path,
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'user-agent': OPTIONS.agent
    },
    body: body
  }
  //console.log(options);
  //console.log(body);
  
  request(options, function (error, response, body) {
    if (error !== null) {
      callback(error);
      return;
    }
    if (body.length === 0) {
      callback("Empty response body", null);
    } else {
      var obj = JSON.parse(body);
      if (!Array.isArray(obj)) {
        callback('General RPC error: ' + JSON.stringify(obj.error), null);
      } else {
        var responses = [];
        for (var i = 0; i < calls.length; i++) {
          responses.push(null);
        }
        for (var i = 0; i < obj.length; i++) {
          var id = obj[i].id;
          delete response['id'];
          responses[id] = obj[i];
        } 
        callback(null, responses, response);
      }
    }
  });
}

// tree result looks like this: [{rid: "01234...", tree: [{rid: "23456...", status: 'locked'}]}, {rid: "12345..."}]
// options are:
//   depth              stop at a given depth from the root client (if omitted, depth is not limited)
//   resource_callback  function to call as each resource is visited. Takes rid, type, and depth parameters.
//   types              list of type strings. Options are "dataport", "datarule", "dispatch". If omitted, visits only clients.
exports.tree = function(cik, options, callback) {
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
  _tree(cik, options, callback, 0);
}

function _tree(cik, options, callback, depth, client_rid) {
  var async = require('async');
  var util = require('util');
  var _ = require('underscore');

  var tree = null;
  var auth = {cik: cik};
  if (typeof client_rid !== 'undefined') {
    auth.client_id = client_rid;
  }
  
  var types = options.hasOwnProperty('types') ? options.types : ['client'];

  exports.call(
    auth,
    'listing',
    [types],
    function(err, rpcresponse, httpresponse) {
      if (err) {
        // console.log('error: ' + err);
        callback(err);
      } else {
        // console.log(rpcresponse);
        var status = rpcresponse[0].status;
        if (status !== 'ok') {
          //console.log('status: ' + status);
          callback({status: status});
        } else {          
          var all_rids = rpcresponse[0].result;
          var client_rids = all_rids[0];
          // if there are no children, respond with an empty tree
          if (_.flatten(all_rids).length === 0) {
            callback(null, []);
            return;
          }
          var resources = [];
          for (var i = 0; i < types.length; i++) {
            var type = types[i];
            var rids = all_rids[i];
            resources = resources.concat(_.map(rids, function(rid) { 
              var r = {rid: rid}; 
              if (type !== 'client') {
                r.type = type;
              }
              return r;
            }));
          }
          if (options.hasOwnProperty('depth')) {
              if (depth === options.depth) {
                callback(null, null);
                return;
              }
          }
          // add tree to each resource
          async.map(resources, function(resource, callback) {
            if (options.hasOwnProperty('resource_callback')) {
              options.resource_callback(resource.rid, 'client', depth + 1);
            }
            if (!resource.hasOwnProperty('type') || resource.type === 'client') {
              // resource is a client
              _tree(cik, options, function(err, tree) {
                if (err) {
                  if (typeof err === 'object' && err !== null) {
                    // if status from listing call is not ok, add status to resource
                    _.extend(resource, err);
                    callback(null, resource);
                  } else {
                    callback(err)
                  }
                } else {
                  // only include tree if the client has children
                  // (or if it's not null, which signals depth limit was reached)
                  if (tree !== null && tree.length > 0) {
                    resource.tree = tree;
                  }
                  callback(null, resource);
                }
              }, depth + 1, resource.rid);
            } else {
              // resource is not a client
              callback(null, resource);
            }
          },
          function(err, tree) {
            if (err) callback(err)
            else {
              callback(null, tree);
            }
          });
        }
      }
    }
  );
}
 
