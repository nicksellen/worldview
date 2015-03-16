# worldview

A small library for managing a nested global state object with listeners.

* uses global immutable data structure to hold state
* uses dot notation to refer to nested path (e.g. 'things.like.this')
* batches update using requestAnimationFrame/setImmediate/setTimeout
* supports atomic updates by passing a function
* supports read-only cursors, and writable cursors
* supports compound cursors
* supports derived value cursors
* cursor/compound/derived values can be nested arbitarily (hopefully)
* can efficiently listen for updates on any kind of value
* works in browser or in node/io
* written in es6, babel'd to es5
* exploratory/experimental state, do not use for anything real...

## Examples

### Update a simple value

````javascript
var world = require('worldview');

world.listen(function(state){
  console.log('the state of the world is', state);
});

world.update('name', 'Earth');
````

### Use all the cool things at once

````javascript
var world = require('worldview');

// readonly cursors
var nick = world.at('people.nick');
var peter = world.at('people.peter');

// they keys a/b let me refer to them in the listener by key
var nickAndPeter = world.compound({ a: nick, b: peter });

var derived = nickAndPeter.derive(function(obj){
  // it will be passed { a: undefined, b: undefined } at the beginning...
  if (obj.a && obj.b) {
    return 'nick is ' + obj.a.age + ' and peter is ' + obj.b.age;
  }
});

// these will get called whenever people.nick or people.peter changes
// after having been run through the derivation function about
derived.listen(function(status){
  console.log('status:', status);
});

// these updates will be batched
world.update('people.nick', { age: 31 });
world.update('people.peter', { age: 35 });

setTimeout(function(){
  // 10 years passes...
  world.update('people.nick', { age: 41 });
  world.update('people.peter', { age: 45 });
}, 1000);
````

## What do you mean by efficient updates?

Well, it uses immutable values so all comparisons are just object identity ones. These are very fast. This means trees can be diff'd very quickly, but I also traverse the trees with the listeners, if there are no listeners for that part of the tree we don't need to even do the object comparisons.

To achieve this the listeners are stored globally, this also means they can be combined so there is no penalty for having lots of listeners on the same path, the time to find the listeners only grows with the number of unique paths being listened on.

## How to use it?

It's not published yet, but you can grab an es5 version from the build dir. Browserify it (or similar) to use it in the browser. src/worldview.js is the es6 code.

Or run it in node (from the project dir):

````javascript
var require('./build/worldview');
// ... etc
````
