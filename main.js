// example usage of onep.js
//

(function() {
  var async = require('async');
  var util = require('util');
  var rpc = require('./rpc');
  if (process.argv.length < 3) {
    console.log('node main.js <cik>');
    return;
  }
  var cik = process.argv[2];
  
  // display a tree
  // tree looks like this: [{rid: "01234...", tree: <tree>}, {rid: "12345..."}]
  function printtree(tree, indent) {
    if (typeof indent === 'undefined') {
      indent = ''; 
    } 
    if (tree === null) {
      return;
    }

    for (var i = 0; i < tree.length; i++) {
      var resource = tree[i];
      var status = '';
      if (resource.hasOwnProperty('status')) {
        status = ' status: ' + resource.status; 
      }
      console.log(indent + resource.rid + status);
      if (resource.hasOwnProperty('tree')) {
        printtree(resource.tree, indent + '  ');
      }
    }
  }

  rpc.setOptions({https: true});

  // get info about the client
  rpc.call(cik, 'info', [{alias: ''}, {}],
      function(err, rpcresponse, httpresponse) {
        if (err) {
          console.log('error: ' + err);  
        } else {
          if (rpcresponse[0].status === 'ok') {
              console.log(JSON.stringify(rpcresponse[0].result));
          } else {
              console.log('Unexpected status: ' + rpcresponse[0].status);
          }
        }
  });

  // get listing and info in one request
  rpc.callMulti(
    cik,
    [{procedure: 'listing', arguments: [['client', 'dataport']]},
     {procedure: 'info', arguments: [{alias: ""}, {basic: true}]}],
    function(err, rpcresponse, httpresponse) {
      if (err) {
        console.log('error: ' + err);
      } else {
        console.log('response: ' + util.inspect(rpcresponse, false, null));
      }
  });

  // test printtree
  printtree([{rid: "01234...", tree: [{rid: "a01234..."}, {rid: "a12345..."}]}, {rid: "12345..."}]);
  printtree([])
  printtree([{rid: "01234...", tree: [{rid: "a01234..."}, {rid: "a12345..."}]}, {rid: "12345...", tree: []}]);

  // get a tree listing
  rpc.tree(
    cik,
    {
      depth: 2,
      resource_callback: function (rid, type, depth) {
        console.log('Visiting ' + rid + ' (' + type + ') depth:' + depth);
      },
      types: ['dataport', 'datarule', 'dispatch']
    },
    function(err, tree) { 
      if (err) 
        console.log('error: ' + err);
      else {
        console.log(JSON.stringify(tree, null, 2));
      }
    }
  );
}).call(this);
