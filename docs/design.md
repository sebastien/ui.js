# UI.js Design Decisions

## Use of HTML instead of JSX

JSX is not standard JavaScript, although it's widely used, and we do
want to be able to use *UI.js* from a [JSFiddle](https://jsfiddle.net),
with no more than an import.

## Use of `data-{template,id,path,state}` attributes

*UI.js* stores important data as HTML attributes, as opposed to, say
adding new attributes to DOM nodes. The reasons for that is that it
makes it possible to hydrate a component from a DOM tree directly, as
most of the internal state can be captured as data attributes.

## Use of an internal PubSub bus

The internal PubSub bus is used to enable subscribing to arbitrary
updates of the data, which then allows for granular rendering updates.
Imagine a huge list of items, with PubSub it's easy to change just the
one item that has changed, without having to re-render the whole list,
like it would be the case with say, React.

## 3-States Approach

There is always three states/sources of data, each passed from parent to
child:

-   The current value: the main value worked on by the component.
-   The global state: to allow for pub/sub across the rendering
    hierarchy.
-   The component state: to hold view-specific data, such as
    derived/synthetic data, user-selections, etc.
