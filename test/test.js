var assert = require('assert')

describe('world', function(){

  var world = require('../build/worldview');

  afterEach(function(){
    world.clear();
  });

  it('exists', function(){
    assert(world, 'world is missing');
  })

  it('is a function that returns an object', function(){
    assert.equal(typeof world, 'function');
    assert.equal(typeof world(),  'object');
  });

  it('you can update a value in it', function(done){
    var unlisten = world.listen(function(w){
      unlisten();
      assert.equal(w.k, 'v');

      // too many ways to access it?
      assert.equal(world.get('k'), 'v');
      assert.equal(world.at('k')(), 'v');
      assert.equal(world.at('k').get(), 'v');

      done();
    });
    world.update('k', 'v');
  });

  it('can listen at a property', function(done){
    var unlisten = world.listen('something', function(val){
      unlisten();
      assert.equal(val, 'yay');
      done();
    });
    world.update('something', 'yay');
  });

  it('can listen at root', function(done){
    var unlisten = world.listen(function(data){
      unlisten();
      assert.equal(data.deep.inside.world, 'bomp');
      done();
    });
    world.update('deep.inside.world', 'bomp');
  });

  it('can chain lots of world views', function(done){
    var things = world.writableAt('this').writableAt('or').writableAt('that').writableAt('wooo');
    var unlisten = things.listen(function(val) {
      unlisten();
      assert.equal(val, 'my value');
      done();
    });
    things.update('my value');
  });

  it('updates are batched', function(done){
    world.listen(function(data, prev, unlisten){
      unlisten();
      // both changed values are passed in on the first callback
      assert.equal(data.a, 'a value');
      assert.equal(data.b, 'b value');
      done();
    });
    world.update('a', 'a value');
    world.update('b', 'b value');
  });

  it('update atomically by function', function(done){
    var num = world.writableAt('num');
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
    var val = world.writableAt('this.can.be.anything');
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

  it('you can set root to just a normal value like a string', function(done){
    var unlisten = world.listen(function(data){
      unlisten();
      assert.equal('root can be a string!', data);

      // second round
      var unlisten2 = world.listen(function(data2){
        unlisten2();
        assert.equal(data2.backto, 'object again');
        done();
      });
      world.update({ backto: 'object again' });

    });
    world.update('root can be a string!');
  });

  describe('derived', function(){

    it('you can derive values', function(done){

      var view = world.writableAt('a.nice.path');

      var boo = view.derive(function(value){
        if (value === undefined) return;
        return 'we did something to [' + value + ']';
      });

      var boo2 = boo.derive(function(value){
        return 'even more: ' + value;
      });

      assert.equal(boo(), undefined);
      assert.equal(boo2(), 'even more: undefined');

      world.listen(function(current, previous, unlisten){
        unlisten();
        assert.equal(current.a.nice.path, 'val');
        assert.equal(boo(), 'we did something to [val]');
        assert.equal(boo2(), 'even more: ' + boo());
        done();
      });

      var first = true;
      world.listen('a.nice.path', function(value){
        if (first) {
          assert.equal(value, 'val');
        }
        first = false;
      });

      view.update('val');
    });

  });

});