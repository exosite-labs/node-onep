var assert = require('assert');
var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');

var rpc = require('../rpc');
var config = require('./config');
var mock = require('onep-mock');


var ROOT = config.rootCIK;

function random (howMany, chars) {
  chars = chars || 
    "abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789";
  var rnd = crypto.randomBytes(howMany);
  var value = new Array(howMany);
  var len = chars.length;

  for (var i = 0; i < howMany; i++) {
    value[i] = chars[rnd[i] % len];
  }

  return value.join('');
}

function genErr(err, rpcresponse, httpresponse) {
  var msg = 'General error. ' + err ;
  if (config.useMockServer) {
    msg += ' (config.useMockServer is set. Is it possible the mock server isn\'t running?)';
  }
  return msg;
}

function jstr(value, replacer, space) {
  return JSON.stringify(value, replacer, space);
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

  function withTemporaryDataport(callback) {
    rpc.createFromSpec(ROOT, {
        clients: [{name: 'child'}],
        dataports: [{name: 'ChildFloat', format: 'float', alias: 'childfloat' + random(10)}]
      }, function(err, rids) {
      assert(!err, JSON.stringify(err));
      
      var childrid = rids.clients[0];
      var auth = {cik: ROOT, client_id: childrid};
      rpc.createFromSpec(
        auth,
        {dataports: [
          {name: 'ChildFloat', format: 'float', alias: 'dataport' + random(10)}
        ]}, function(err, rids) {
          assert(!err, '' + err);
          callback(auth, rids.dataports[0], function(callback) {
            // test done. do cleanup
            rpc.call(ROOT, 'drop', [childrid], function(err, rpcresponse) {
              assert(!err, '' + err);  
              assert.equal(rpcresponse[0].status, 'ok');
              callback(null);
            });
          });
        });
    });
  }

  describe('massive call()', function() {
    it('should be able to make a lot of connections simultaneously', function(done) {
      withTemporaryDataport(function(auth, dataport_rid, cleanup) {
        // make a big list of numbers
        var nums = [];
        for (var i = 0; i <= 50; i++) {
          nums.push(i); 
        }
        async.map(nums, function(i, callback) {
          rpc.call(auth, 'read', [dataport_rid, {limit: 1}], function(err, rpcresponse) {
            assert(rpcresponse[0].result.length === 0);
            callback(null, rpcresponse[0]);
          });
        }, function(err, results) {
          assert(!err, err + '');
          cleanup(function(err) {
            done();
          });
        });
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
          rpc.createFromSpec(ROOT, {
              clients: [{name: 'child'}],
              dataports: [{name: 'ChildFloat', format: 'float', alias: 'childfloat'}]
            }, function(err, rids) {
            assert(!err, '' + err);
            assert.equal(rids.clients.length, 1);
            assert.equal(rids.dataports.length, 1);
            var childrid = rids.clients[0];
            assert.equal(childrid.length, 40);
            rpc.createFromSpec(
              {cik: ROOT, client_id: childrid},
              {dataports: [
                {name: 'ChildFloat', format: 'float', alias: 'childfloat'},
                {name: 'ChildString', format: 'string', alias: 'childstring'}
              ]}, function(err, rids) {
                assert(!err, '' + err);
                assert(rids.dataports.length === 2);
                callback(err);
              });
          });
        },
        function(callback) {
          rpc.tree(ROOT,
            {
              depth: 2,
              visit: function (rid, type, depth) {
                //console.log('Visiting ' + rid + ' (' + type + ') depth:' + depth);
              },
              info: function(rid, type, depth) {
                return type === 'dataport' ?  {description: true} : {basic: true, aliases: true};
              },
              types: ['dataport', 'datarule', 'dispatch']
            },
            function(err, tree) { 
              function checkInfo(res, type) {
                var resStr = jstr(res, null, 2);
                assert(res.hasOwnProperty('info'));
                var keys = _.keys(res.info);
                assert(_.contains(keys, type));
              }
              assert(!err, 'General error ' + jstr(err));

              // test root
              assert(_.isObject(tree));
              assert(tree.hasOwnProperty('rid'));
              assert(tree.type === 'client');
              checkInfo(tree, 'basic');

              // test children
              assert(tree.children.length === 2);
              _.each(tree.children, function(child) {
                assert(child.hasOwnProperty('rid'));
                checkInfo(child, child.type === 'dataport' ? 'description' : 'basic');
              });
              var clientIdx = tree.children[0].type === 'dataport' ? 1 : 0;
              assert.equal(tree.children[clientIdx].children[0].type, 'dataport');
              assert.equal(tree.children[clientIdx === 0 ? 1 : 0].type, 'dataport');
              assert(tree.children[0].hasOwnProperty('rid'));
              assert(tree.children[clientIdx].children.length === 2);
              assert(_.every(tree.children[clientIdx].children, function(child) { 
                return ['ChildFloat', 'ChildString'].indexOf(child.info.description.name) !== -1;
              }));

              // test parent RID in walk visit function
              var testVisit = {
                rid: tree.children[clientIdx].children[0].rid,
                depth: 2,
                parentRid: tree.children[clientIdx].rid,
                found: false  // init to false
              };

              rpc.walk(tree, function(resource, depth, parentRid) {
                if (depth === 0) {
                  assert(typeof parentRid === 'undefined', 'for root, parentRID is undefined in walk()');
                }
                if (resource.rid === testVisit.rid) {
                  assert.equal(parentRid, testVisit.parentRid, 'parent RID matches in walk()');
                  assert.equal(depth, testVisit.depth, 'depth matches in walk()');
                  testVisit.found = true; 
                }
              });

              assert(testVisit.found, 'found child in walk()');
              done();
              callback(null);
            });
        }]);
    });
  });
});
