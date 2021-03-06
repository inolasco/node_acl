/**
  MongoDB Backend.
  Implementation of the storage backend using MongoDB
*/
"use strict";

var contract = require('./contract');
var async = require('async');
var _ = require('lodash');

// Name of the collection where meta and allowsXXX are stored.
// If prefix is specified, it will be prepended to this name, like acl_resources
var aclCollectionName = 'resources';

function MongoDBBackend(db, prefix, useSingle){
  this.db = db;
  this.prefix = typeof prefix !== 'undefined' ? prefix : '';
  this.useSingle = (typeof useSingle !== 'undefined') ? useSingle : false;
}

MongoDBBackend.prototype = {
 /**
     Begins a transaction.
  */
  begin : function(){
    // returns a transaction object(just an array of functions will do here.)
    return [];
  },

  /**
     Ends a transaction (and executes it)
  */
  end : function(transaction, cb){
    contract(arguments).params('array', 'function').end();
    async.series(transaction,function(err){
      cb(err instanceof Error? err : undefined);
    });
  },

  /**
    Cleans the whole storage.
  */
  clean : function(cb){
    contract(arguments).params('function').end();
    this.db.collections(function(err, collections) {
      if (err instanceof Error) return cb(err);
      async.forEach(collections,function(coll,innercb){
        coll.drop(function(){innercb()}); // ignores errors
      },cb);
    });
  },

  /**
     Gets the contents at the bucket's key.
  */
  get : function(bucket, key, cb){
    contract(arguments)
        .params('string', 'string', 'function')
        .end();
    var searchParams = (this.useSingle? {_bucketname: bucket, key:key} : {key:key});
    var collName = (this.useSingle? aclCollectionName : bucket);

    this.db.collection(this.prefix + collName,function(err,collection){
      if(err instanceof Error) return cb(err);
      // Excluding bucket field from search result
      collection.findOne(searchParams, {_bucketname: 0},function(err, doc){
        if(err) return cb(err);
        if(! _.isObject(doc) ) return cb(undefined,[]);
        cb(undefined,_.without(_.keys(doc),"key","_id"));
      });
    });
  },

  /**
    Returns the union of the values in the given keys.
  */
  union : function(bucket, keys, cb){
    contract(arguments)
      .params('string', 'array', 'function')
      .end();

    var searchParams = (this.useSingle? {_bucketname: bucket, key: { $in: keys }} : {key: { $in: keys }});
    var collName = (this.useSingle? aclCollectionName : bucket);

    this.db.collection(this.prefix + collName,function(err,collection){
      if(err instanceof Error) return cb(err);
      // Excluding bucket field from search result
      collection.find(searchParams, {_bucketname: 0}).toArray(function(err,docs){
        if(err instanceof Error) return cb(err);
        if( ! docs.length ) return cb(undefined, []);
        var keyArrays = [];
        docs.forEach(function(doc){
          keyArrays.push.apply(keyArrays, _.keys(doc));
        });
        cb(undefined, _.without(_.union(keyArrays),"key","_id"));
      });
    });
  },

  /**
    Adds values to a given key inside a bucket.
  */
  add : function(transaction, bucket, key, values){
    contract(arguments)
        .params('array', 'string', 'string','string|array')
        .end();

    if(key=="key") throw new Error("Key name 'key' is not allowed.");
    var self=this;
    var updateParams = (self.useSingle? {_bucketname: bucket, key:key} : {key:key});
    var collName = (self.useSingle? aclCollectionName : bucket);

    transaction.push(function(cb){
      values = makeArray(values);
      self.db.collection(self.prefix + collName, function(err,collection){
        if(err instanceof Error) return cb(err);

        // build doc from array values
        var doc = {};
        values.forEach(function(value){doc[value]=true;});

        // update document
        collection.update(updateParams,{$set:doc},{safe:true,upsert:true},function(err){
          if(err instanceof Error) return cb(err);
          cb(undefined);
        });
      });
    });
  },

  /**
     Delete the given key(s) at the bucket
  */
  del : function(transaction, bucket, keys){
    contract(arguments)
        .params('array', 'string', 'string|array')
        .end();
    keys = makeArray(keys);
    var self= this;
    var updateParams = (self.useSingle? {_bucketname: bucket, key:{$in:keys}} : {key:{$in:keys}});
    var collName = (self.useSingle? aclCollectionName : bucket);

    transaction.push(function(cb){
      self.db.collection(self.prefix + collName,function(err,collection){
        if(err instanceof Error) return cb(err);
        collection.remove(updateParams,{safe:true},function(err){
          if(err instanceof Error) return cb(err);
          cb(undefined);
        });
      });
    });
  },

  /**
    Removes values from a given key inside a bucket.
  */
  remove : function(transaction, bucket, key, values){
    contract(arguments)
        .params('array', 'string', 'string','string|array')
        .end();

    var self=this;
    var updateParams = (self.useSingle? {_bucketname: bucket, key:key} : {key:key});
    var collName = (self.useSingle? aclCollectionName : bucket);

    values = makeArray(values);
    transaction.push(function(cb){
      self.db.collection(self.prefix + collName,function(err,collection){
        if(err instanceof Error) return cb(err);

        // build doc from array values
        var doc = {};
        values.forEach(function(value){doc[value]=true;});

        // update document
        collection.update(updateParams,{$unset:doc},{safe:true,upsert:true},function(err){
          if(err instanceof Error) return cb(err);
          cb(undefined);
        });
      });
    });
  }
}

function makeArray(arr){
  return Array.isArray(arr) ? arr : [arr];
}

exports = module.exports = MongoDBBackend;
