# Notes: Templates


Some nodes like `<slot>` and `<template>` should not be rendered and instead
make the result flattened.

For instance

```
<template>A<slot out:text="B"></slot>C<slot out:text="D"></slot>E</template>
```

leads to the following rendered tree

```
0: A
1: <!--out:text=B-->
2: C
3: <!--out:text=D-->
4: E
```

and then after a render

```
0: A
3: <!--out:text=B-->
2: B            # Inserted node, shifts next of + 1
3: C
3: <!--out:text=D-->
5: D            # Inserted node, shifts next of + 1
5: F
```

The effect positions for B and C (respectively [1] and [3]) are valid on first
render, but are not after. Further render may add more nodes, for instance in a
template effect with multiple root nodes.

This also occurs with nested templates.

```
<template>V=<template x:match="V"><span x:case="V">true</span><span x:otherwise>false</span></template></template>
```

before rendering, the template is like so

```
0:V=
1:<!-- x:match=V -->
2:<!-- x:case=V -->
3:<!-- x:otherwise -->
```

after initial render

```
0:V=
1:<!-- x:match=V -->
2:<!-- x:case=V -->
3:<span>true</span>
4:<!-- x:otherwise -->
```

or

```
0:V=
1:<!-- x:match=V -->
2:<!-- x:case=V -->
3:<!-- x:otherwise -->
4:<span>true</span>
```

Any conditional or iterative effect would be replaced by a comment node, as
it may disappear.


