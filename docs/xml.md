UIjs comes with an XSLT stylesheet that makes it easy to write self documenting
components that can be distributed as a single XML file, including the
templates, examples of usage, JavaScript controller code and CSS styling.

## `<UI>`

## `<Applet>`

## `<Component>`

## `<View>`

## `<Controller>`

## `<description>`

## `<import>`

## `<script>`

## `s:*`

The `s:*` namespace is used to define styling in XML. An `s:` element name
will be *stylename*, while its attributes will be style properties. The style
name will be a concatenation of all the style names of its ancestors `s:*` nodes.
For instance, if `s:Item` is in an `s:Todo`, the corresponding CSS style
class will be `.TodoItem`.

An `s:*` element can have special attributes:

- `class="CLASSES"` in which case the expanded HTML will have the given class attribute
- `as="TAG"`, in which case the element name will be `TAG`
- `xml:*`, in which case the attribute will be output as-is without the namespace
- `{out,in,inout,do}:*`, in which ase the attribute is output as-is


```xml
<s:Todo class="list">
  <s:Item padding="10px 16px">Buy cheese</s:Item>
</s:Todo>
```

generates the following HTML and CSS:

```css
.TodoItem {
  padding: 10px 16px;
}
````

```html
<div class="Todo list"><div class="TodoItem">Buy cheese</div><div>
.TodoItem {
  padding: 10px 16px;
}
````
