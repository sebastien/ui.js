First step, declare where your components are located, by default:

``` xml
<import components="../lib/xml/components/"/>
```

Second step, reference your component

``` xml
<x:Item>…</x:Item>
```

in HTML

``` html
<slot template="Item" />
```

Thids step, fill in the parameters

``` xml
<x:Item label="Hello, world!" />
```

``` html
<slot template="Item" label="Hello, world!" />
```

Including assigning content to slots

``` xml
<x:Item label="Hello, world!">
  <in:icon><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="black"/></svg></in:icon>
</x:Item>
```

``` html
<slot template="Item" label="Hello, world!">
  <slot icon><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="black"/></svg></slot>
</slot>
```
