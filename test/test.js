var assert = require('assert')

describe('root', function(){

  var root = require('../src/worldview');

  afterEach(function(done){
    root.clear();
    root.next(function(){
      done();
    });
  });

  it('exists', function(){
    assert(root, 'root is missing');
  })

  it('is a function that returns an object', function(){
    assert.equal(typeof root, 'function');
    assert.equal(typeof root(),  'object');
  });

  it('you can update a value in it', function(done){
    var unlisten = root.listen(function(w){
      unlisten();
      assert.equal(w.k, 'v');

      // too many ways to access it?
      assert.equal(root.get('k'), 'v');
      assert.equal(root.at('k')(), 'v');
      assert.equal(root.at('k').get(), 'v');

      done();
    }, false);
    root.update('k', 'v');
  });

  it('can listen at a property', function(done){
    root.listen('something', function(val, previousVal, unlisten){
      unlisten();
      assert.equal(val, 'yay');
      done();
    });
    root.update('something', 'yay');
  });

  it('can listen at root', function(done){
    root.listen(function(data, previousData, unlisten){
      unlisten();
      assert.equal(data.deep.inside.root, 'bomp');
      done();
    }, false);
    root.update('deep.inside.root', 'bomp');
  });

  it('can chain lots of root views', function(done){
    var things = root.writableAt('this').writableAt('or').writableAt('that').writableAt('wooo');
    var unlisten = things.listen(function(val) {
      unlisten();
      assert.equal(val, 'my value');
      done();
    });
    things.update('my value');
  });

  it('updates are batched', function(done){
    root.listen(function(data, prev, unlisten){
      unlisten();
      // both changed values are passed in on the first callback
      assert.equal(data.a, 'a value');
      assert.equal(data.b, 'b value');
      done();
    }, false);
    root.update('a', 'a value');
    root.update('b', 'b value');
  });

  it('update atomically by function', function(done){
    var num = root.writableAt('num');
    var unlisten = num.listen(function(n){
      unlisten();
      assert.equal(n, 3);
      assert.equal(num(), 3);
      done();
    });
    num.update(0);
    num.update(function(n){ return n + 1; });
    num.update(function(n){ return n + 1; });
    num.update(function(n){ return n + 1; });
  });

  it('can update via function without previous value', function(done){
    var val = root.writableAt('this.can.be.anything');
    var unlisten = val.listen(function(v){
      unlisten();
      assert.equal(v, 'the value');
      done();
    });
    val.update(function(){
      assert(arguments.length === 0); // doesn't pass in old value if we don't specify arg
      return 'the value';
    });
  });

  it('gives root a create world function', function(){
    assert.equal(typeof root.createWorld, 'function');
  });

  it('gives root a compound function', function(){
    assert.equal(typeof root.compound, 'function');
  });

  it('is possible to create a brand new empty world', function(){
    var w = root.createWorld();
    assert.equal(typeof w, 'function');
    assert.equal(w(),  undefined);
  });

  it('you can set root to just a normal value like a string', function(done){
    root.listen(function(data, previousData, unlisten){
      unlisten();
      assert.equal('root can be a string!', data);

      // second round
      root.listen(function(data2, previousData2, unlisten2){
        unlisten2();
        assert.equal(data2.backto, 'object again');
        done();
      }, false);
      root.update({ backto: 'object again' });

    }, false);
    root.update('root can be a string!');
  });

  describe('derived', function(){

    it('you can derive values', function(done){

      var view = root.at('a.nice.path');

      var boo = view.derive(function(value){
        return 'we did something to [' + value + ']';
      });

      var boo2 = boo.derive(function(value){
        return 'even more: ' + value;
      });

      assert.equal(boo(), undefined);
      assert.equal(boo2(), undefined);

      root.listen(function(current, previous, unlisten){
        unlisten();
        assert.equal(current.a.nice.path, 'val');
        assert.equal(boo(), 'we did something to [val]');
        assert.equal(boo2(), 'even more: ' + boo());
        done();
      }, false);

      var first = true;
      root.listen('a.nice.path', function(value){
        if (first) {
          assert.equal(value, 'val');
        }
        first = false;
      });

      root.update('a.nice.path', 'val');
    });

  });

  it('supports compound views', function(done){

    var here = root.at('things.here');
    var there = root.at('things.there');

    var compound = root.compound({ a: here, b: there });

    compound.listen(function(vals, oldVals, unlisten) {
      unlisten();
      assert.equal(oldVals.a, undefined);
      assert.equal(oldVals.b, undefined);
      assert.equal(vals.a, 'this is here');
      assert.equal(vals.b, 'this is there');
      var getVals = compound();
      assert.equal(getVals.a, 'this is here');
      assert.equal(getVals.b, 'this is there');
      done();
    });

    root.update('things.here', 'this is here');
    root.update('things.there', 'this is there');
  });

  it('you can derive values from compounds', function(done){

    var compound = root.compound({
      a: 'what.path.now', 
      b: 'or.something.else'
    });
    
    // derived from compound...
    var derived = compound.derive(function(vals){
      return {
        a: vals.a,
        b: vals.b,
        c: 'added this in derive'
      }
    });

    // compound from derived...
    var c2 = root.compound({
      d: derived,
      e: root.at('inside.e')
    });

    var called = 0;

    c2.listen(function(omg, previousOmg, unlistenc2){
      unlistenc2();
      assert.equal(omg.d.a, 'a');
      assert.equal(omg.d.b, 'b');
      assert.equal(omg.d.c, 'added this in derive');
      assert.equal(omg.e, 'this is e');
      if (++called === 2) done();
    }, false);

    derived.listen(function(alltogether, previous, unlisten){
      unlisten();
      var w = root();
      assert.equal(Object.keys(alltogether).length, 3);
      assert.equal(alltogether.a, 'a');
      assert.equal(alltogether.b, 'b');
      assert.equal(alltogether.c, 'added this in derive');
      assert.equal(w.what.path.now, 'a');
      assert.equal(w.or.something['else'], 'b');
      assert.equal(compound().a, 'a');
      assert.equal(compound().b, 'b');
      assert.equal(derived().a, 'a');
      assert.equal(derived().b, 'b');
      assert.equal(derived().c, 'added this in derive');
      if (++called === 2) done();
    }, false);

    root.update('what.path.now', 'a');
    root.update('or.something.else', 'b');
    root.update('inside.e', 'this is e');

  });

  it('calls listener with initial value', function(done){
    root.update('foo', 'I am foo initial');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.at('foo').listen(function(foo, nothing, unlisten){
        unlisten();
        assert.equal(foo, 'I am foo initial');
        done();
      });
    });
  });

  it('does not call listener with initial value', function(done){
    root.update('foo', 'I am foo initial');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.at('foo').listen(function(foo, nothing, unlisten){
        unlisten();
        assert.equal(foo, 'I am foo next');
        done();
      }, false);
    });
  });

  it('calls listener with initial value on subpath', function(done){
    root.update('foo', 'I am foo initial');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.listen('foo', function(foo, nothing, unlisten){
        unlisten();
        assert.equal(foo, 'I am foo initial');
        done();
      });
    });
  });

  it('does not call listener with initial value on subpath', function(done){
    root.update('foo', 'I am foo initial');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.listen('foo', function(foo, nothing, unlisten){
        unlisten();
        assert.equal(foo, 'I am foo next');
        done();
      }, false);
    });
  });

  it('calls listener with initial value on compound listen', function(done){
    root.update('foo', 'I am foo inital');
    root.update('bar', 'I am bar inital');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.update('bar', 'I am bar next');
      root.compound({ foo: 'foo', bar: 'bar' }).listen(function(m, nothing, unlisten){
        unlisten();
        assert.equal(m.foo, 'I am foo inital');
        assert.equal(m.bar, 'I am bar inital');
        done();
      });
    });
  });

  it('does not call listener with initial value on compound listen', function(done){
    root.update('foo', 'I am foo inital');
    root.update('bar', 'I am bar inital');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.update('bar', 'I am bar next');
      root.compound({ foo: 'foo', bar: 'bar' }).listen(function(m, nothing, unlisten){
        unlisten();
        assert.equal(m.foo, 'I am foo next');
        assert.equal(m.bar, 'I am bar next');
        done();
      }, false);
    });
  });

  it('calls listener with initial value on derived listen', function(done){
    root.update('foo', 'I am foo initial');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.at('foo').derive(function(foo) {
        return foo && foo.replace('am', 'was');
      }).listen(function(foo, nothing, unlisten){
        unlisten();
        assert.equal(foo, 'I was foo initial');
        done();
      });
    });
  });

  it('does not call listener with initial value on derived listen', function(done){
    root.update('foo', 'I am foo initial');
    root.next(function(){
      root.update('foo', 'I am foo next');
      root.at('foo').derive(function(foo) {
        return foo && foo.replace('am', 'was');
      }).listen(function(foo, nothing, unlisten){
        unlisten();
        assert.equal(foo, 'I was foo next');
        done();
      }, false);
    });
  });

  it('lets you access the path of the root', function(){
    assert.equal(root.path(), '');
  });

  it('lets you access the path of the view', function(){
    var path = 'something.inside.here';
    var s = root.at(path);
    assert.equal(s.path(), path);
  });

});

