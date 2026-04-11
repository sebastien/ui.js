/** @jsxImportSource @ui */

import { $ } from "@ui/hyperscript.js";
import { render } from "@ui/client.js";

const now = () => new Date().toISOString();

const emptyDraft = () => ({ id: null, title: "", body: "" });

const seedPosts = () => [
	{
		id: 1,
		title: "Welcome to the Blog",
		body: "This example demonstrates a CRUD flow driven by local cell state.",
		createdAt: now(),
		updatedAt: now(),
	},
	{
		id: 2,
		title: "Second Post",
		body: "Select, edit, save and delete posts with granular reactive updates.",
		createdAt: now(),
		updatedAt: now(),
	},
];

const createInitialState = () => {
	const posts = seedPosts();
	const selected = posts[0] || null;
	return {
		blog: {
			title: "Blog CRUD",
			description: "UI.js JSX single-module example with local cell state",
		},
		posts,
		selectedPostId: selected?.id ?? null,
		nextPostId: Math.max(0, ...posts.map((_) => _.id)) + 1,
		editorMode: selected ? "edit" : "create",
		draft: selected
			? {
					id: selected.id,
					title: selected.title,
					body: selected.body,
				}
			: emptyDraft(),
	};
};

const PostList = () => {
	const posts = state.apply((value) => value?.posts || []);
	const selectedPostId = state.apply((value) => value?.selectedPostId ?? null);

	return (
		<section>
			<header style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
				<h2 style="margin:0;">Posts</h2>
				<button type="button" onClick={() => operations.createPost()}>
					New Post
				</button>
			</header>
			<ul style="padding-left:1.25rem;">
				{posts.map((post) => {
					const postId = post.apply((value) => value.id);
					return (
						<li style="margin:0.35rem 0;">
							<button
								type="button"
								onClick={() => operations.selectPost(postId.get())}
								style={selectedPostId.apply((selected) =>
									selected === postId.get()
										? "font-weight:700;"
										: "font-weight:400;",
								)}
							>
								{post.apply((value) => value.title)}
							</button>{" "}
							<button
								type="button"
								onClick={() => operations.startEdit(postId.get())}
							>
								Edit
							</button>{" "}
							<button
								type="button"
								onClick={() => operations.deletePost(postId.get())}
							>
								Delete
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
};

const PostEditor = () => {
	const mode = state.apply((value) => value?.editorMode || "create");
	const draftTitle = state.apply((value) => value?.draft?.title || "");
	const draftBody = state.apply((value) => value?.draft?.body || "");

	return (
		<section>
			<h2 style="margin-top:0;">
				{mode.apply((value) =>
					value === "create" ? "Create Post" : "Edit Post",
				)}
			</h2>
			<p class="small dim">Title</p>
			<input
				type="text"
				value={draftTitle}
				onInput={(event) => operations.updateDraft("title", event.target.value)}
				placeholder="Post title"
				style="width:100%;"
			/>
			<p class="small dim">Body</p>
			<textarea
				rows={8}
				value={draftBody}
				onInput={(event) => operations.updateDraft("body", event.target.value)}
				placeholder="Write your post body"
				style="width:100%;"
			></textarea>
			<div style="display:flex;gap:8px;margin-top:8px;">
				<button type="button" onClick={() => operations.savePost()}>
					Save
				</button>
				<button type="button" onClick={() => operations.resetDraft()}>
					Reset
				</button>
			</div>
		</section>
	);
};

const PostPreview = () => {
	const selected = state.apply(
		(value) =>
			value?.posts?.find((post) => post.id === value.selectedPostId) || null,
	);

	return (
		<section>
			<h2 style="margin-top:0;">Preview</h2>
			{selected.match(
				(_) => _.case(null, <p class="dim">No post selected.</p>),
				(_) =>
					_.else(
						<article>
							<h3>{selected.apply((value) => value?.title || "")}</h3>
							<p>{selected.apply((value) => value?.body || "")}</p>
							<p class="small dim">
								Updated {selected.apply((value) => value?.updatedAt || "")}
							</p>
						</article>,
					),
			)}
		</section>
	);
};

const CRUDApplication = ({ title, description }) => {
	return (
		<main style="max-width:980px;margin:1.5rem auto;padding:0 1rem;">
			<header>
				<h1 style="margin-bottom:0.35rem;">{title}</h1>
				<p class="dim" style="margin-top:0;">
					{description}
				</p>
			</header>
			<section style="display:grid;grid-template-columns:1fr 1.3fr;gap:16px;align-items:start;">
				<PostList />
				<div style="display:grid;gap:16px;">
					<PostEditor />
					<PostPreview />
				</div>
			</section>
		</main>
	);
};

export default (root) => render(CRUDApplication, {}, root);
// EOF
