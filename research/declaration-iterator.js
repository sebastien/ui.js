
const define = (declarator) => {
	let i = 0;
	let res = [];
	function* slots() {
		while (true && i < 10) {
			res.push(i);
			yield i++;
		}
	}
	declarator(...slots())
	return res;
}

// This confirms that (...slots()) will evaluate all, not lazily. It's too bad!
console.log({
	a: define((a) => null),
	b: define((a, b, c) => null),
})
