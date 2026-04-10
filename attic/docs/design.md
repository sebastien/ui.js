# UI.js Design Decisions

## Use of HTML instead of JSX

JSX is not standard JavaScript, although it's widely used, and we do
want to be able to use *UI.js* from a [JSFiddle](https://jsfiddle.net),
with no more than an import. Using HTML makes is simpler to get started
and alleviates the need for implementing a VDOM.

## Use of XML/XSLT

While using HTML and extra attributes makes it easy to get started with
minimal tooling, XML and XSLT together make it possible to abstract much
more and provide a less repetitive experience. With its XSLT stylesheet,
UIjs components can be written as compact document, covering
documentation, view, model, controller and styling.

Here are some benefits of using XML directly:

- Inline style components that are automatically converted to CSS
  classes and definitions. This means that style and views can be
  defined inline (if you want to), and that naming can be kept semantic
  and local to the component.

  ``` xml
  <s:FancyList border="1px wavy pink" as="ul">
  <s:item color="orange" as="li">Orange item</s:item>
  <s/:FancyList>
  ```

  will create

  ``` css
  .FancyList {border:1px wavy pink;}
  .FancyList-item {color: orange;}
  ```

  and

  ``` html
  <ul class="FancyList"><li class="FancyList-item">Orange item</li></ul>
  ```

## Use of `data-{template,id,path,state}` attributes

*UI.js* stores important data as HTML attributes, as opposed to, say
adding new JavaScript attributes to DOM nodes. The reasons for that is
that it makes it possible to hydrate a component from a DOM tree
directly, as most of the internal state can be captured as data
attributes, which are always JSON-encodable primitives.

## Use of an internal PubSub bus

# TODO: We have two pubsub buses now

The internal PubSub bus is used to enable subscribing to arbitrary
updates to the data, which then allows for granular rendering updates.
Imagine a huge list of items, with PubSub it's easy to change just the
one item that has changed, without having to re-render the whole list,
like it would be the case with say, React.

The PubSub bus can be used both in the regular Pub/Sub model, but also
as a way to manage queues. A publisher can set to accumulate value, and
a subscriber can consume values, which will prevent the value from being
accessed by another handler.

- A channel can be used as a queue (accumulating values). For instance,
  when a component is created, its Create events are triggered, but the
  script may not yet be loaded at the point the event is fired. In this
  case the events will be accumulated and flushed.

## 3-States Approach

# TODO: This have been invalidated, there's the scope now

There are always three states/sources of data, each passed from parent
to child:

- The current value: the main value worked on by the component, which
  has a path in the global state tree.
- The global state: to allow for pub/sub across the rendering hierarchy.
- The component (local) state: to hold view-specific data, such as
  derived/synthetic data, user-selections, etc.

## Selectors and Effects

Selectors describe a selection in the data that may span the global
state and the local state. The selectors expresses the dependencies for
the effect, if any selected value, the effect needs to be recalculated.
For effects that use multiple selected values, each effect will store a
local state mapping these values, typically as an array or an object.
For simple values, the only local state required is the previous value.
This supports detecting changes and only triggering an effect if the
value has changed.

## Component local or global state

Components have the option to either work directly with a shared data
structure through the global state (and its pubsub tree), or to work
with a local projection of the global state. For instance, a tree list
component could create a local representation of a tree by maintaining a
state of nodes, keeping track of which ones are expanded or collapsed.
