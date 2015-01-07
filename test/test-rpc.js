var assert = require('assert');
var _ = require('underscore');
var async = require('async');

var rpc = require('../rpc');
var config = require('./config');
var mock = require('onep-mock');

var ROOT = config.rootCIK;

function genErr(err, rpcresponse, httpresponse) {
  var msg = 'General error. ' + err ;
  if (config.useMockServer) {
    msg += ' (config.useMockServer is set. Is it possible the mock server isn\'t running?)';
  }
  return msg;
}

describe('app', function() {
  if (config.useMockServer) {
    rpc.setOptions(config.mockOptions);
    ROOT = config.mockCIK;
    before(function() {
      mock.start();
    });
    after(function() {
      console.log('stopping server');
      mock.stop();
    });
  }

  describe('call()', function() {
    it('should be able to get info for the root client', function(done) {
      rpc.call(ROOT, 'info', [{alias: ''}, {}],
        function(err, rpcresponse, httpresponse) {
          assert(!err, genErr(err, rpcresponse, httpresponse));
          assert.equal(rpcresponse[0].status, 'ok', 'RPC response is ok');
          done();
      });
    });
  });

  describe('callMulti()', function() {
    it('should be able to get both info and listing for the root client', function(done) {
      rpc.callMulti(ROOT,
        [{procedure: 'listing', arguments: [['client', 'dataport'], {}]},
         {procedure: 'info', arguments: [{alias: ""}, {basic: true}]}],
        function(err, rpcresponse, httpresponse) {
          assert(!err, genErr(err, rpcresponse, httpresponse));
          for (var i = 0; i < 2; i++) {
            assert.equal(rpcresponse[i].status, 'ok', 'RPC response is ok');
          }
          var ridsToDrop = _.flatten(_.values(rpcresponse[0].result));
          var calls = _.map(ridsToDrop, function(rid) {
            return {procedure: 'drop', arguments: [rid]};
          });
          rpc.callMulti(ROOT,
            calls,
            function(err, rpcresponse, httpresponse) {
              assert(!err, genErr(err, rpcresponse, httpresponse));
              for (var i = 0; i < rpcresponse.length; i++) {
                assert.equal(rpcresponse[i].status, 'ok', 'RPC response is ok');
              }
              done();
            });
      });
    });
  });

  describe('tree()', function() {
    it('should be able to get tree for the root client', function(done) {
      async.series([
        function(callback) {
          rpc.callMulti(ROOT,
            [{procedure: 'create', arguments: ['client', {limits: {dataport: 1}}]},
             {procedure: 'create', arguments: ['dataport', 
               {format: 'string', retention: {count: "infinity", duration: "infinity"}}]}],
            function(err, rpcresponse, httpresponse) {
              assert(!err, genErr(err, rpcresponse, httpresponse));
              for (var i = 0; i < 2; i++) {
                assert.equal(rpcresponse[i].status, 'ok', 'RPC response is ok');
              }
              var childrid = rpcresponse[0].result;
              rpc.callMulti(
                {cik: ROOT, client_id: childrid},
                [{procedure: 'create', arguments: ['dataport', {name: 'ChildFloat', format: 'float', retention: {count: "infinity", duration: "infinity"}}]}],
                function(err, rpcresponse, httpresponse) {
                  assert(!err, genErr(err, rpcresponse, httpresponse));
                  assert.equal(rpcresponse[0].status, 'ok', 'RPC response is ok');
                  callback(err);
                });
            });
        },
        function(callback) {
          rpc.tree(ROOT,
            {
              depth: 2,
              resource_callback: function (rid, type, depth) {
                //console.log('Visiting ' + rid + ' (' + type + ') depth:' + depth);
              },
              types: ['dataport', 'datarule', 'dispatch']
            },
            function(err, tree) { 
              assert(!err, 'General error ' + err);
              assert(_.isArray(tree));
              assert(tree.length===2);
              assert(tree[0].hasOwnProperty('rid'));
              assert(tree[1].hasOwnProperty('rid'));
              var clientIdx = tree[0].type === 'dataport' ? 1 : 0;
              assert.equal(tree[clientIdx].tree[0].type, 'dataport');
              assert.equal(tree[clientIdx === 0 ? 1 : 0].type, 'dataport');
              assert(tree[1].hasOwnProperty('rid'));
              done();
              callback(null);
            });
        }]);
    });
  });
});
