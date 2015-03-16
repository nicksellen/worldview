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
    var unlisten = world.after(function(w){
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
    var things = world.at('this').at('or').at('that').at('wooo');
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
    var num = world.at('num');
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
    var val = world.at('this.can.be.anything');
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

  it('does some stuff', function(done){

    var view = world.at('a.nice.path');

    var boo = calc(view, function(value){
      console.log('calculating sthing');
      if (value === undefined) return;
      return 'we did something to [' + value + ']';
    });
    assert.equal(boo(), undefined);

    world.listen(function(current, previous, unlisten){
      console.log('AAA world listening', current, previous, boo());
      unlisten();
      assert.equal(current.a.nice.path, 'val');
      //assert.equal(boo(), 'we did something to [val2]');
      done();
    });

    world.listen('a.nice.path', function(value){
      console.log('view set to', value);
    });

    //world.update('a.nice.path', 'val');
    view.update('val');
  });

});

function calc(view, fn) {
  var currentValue = set(view());
  view.listen1(function(value){
    console.log('view listen', value);
    set(value);
  });
  function set(value) {
    currentValue = fn(value);
    console.log('updated calc with', value, 'to', currentValue);
  }
  return function(){
    return currentValue;
  };
}