<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:import href="uijs/css.xslt"/>
	<xsl:import href="uijs/source.xslt"/>
	<xsl:import href="uijs/tree.xslt"/>
	<xsl:import href="uijs/copy.xslt"/>
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--
	# UI.js Component Stylesheet

	Takes a UIjs XML component definition and creates an HTML file that
	displays the component.

	-->
	<xsl:template match="/">
		<html xmlns="http://www.w3.org/1999/xhtml">
			<head>
				<title>Component: <xsl:value-of select="//ui:Component/@name"/></title>
				<meta charset="utf-8"/>
				<meta name="viewport" content="width=device-width, initial-scale=1"/>
				<link href="/lib/css/uijs.css" rel="stylesheet"/>
				<script src="https://unpkg.com/highlightjs@9.16.2/highlight.pack.js"/>
				<link href="https://unpkg.com/highlightjs@9.16.2/styles/atelier-seaside-dark.css" rel="stylesheet"/>
				<style><![CDATA[
					.Preview {
						background: white;
				border: 1px solid var(--control-bd);
				padding: 10px;
					}
				.Tree details {
				  display: block;
				}
				.Tree .name {
				font-weight: bold;
				}
				.Tree .class {
				opacity: 0.65;
				padding-left: 6px;
				display: inline-block;
				}
				.Tree .attribute,
				.Tree .child {
				padding-left: 16px;
				}
				.Tree details > .attributes > .attribute:before {
				display:inline-block;
				padding-left: 16px;
				padding-right: 6px;
				content:"@";
				opacity: 0.5;
				}
				.Tree summary {
				  display: list-item;
				  cursor: pointer;
				}
				.Tree summary:hover::before {
				color: var(--color-accent);
				}
				.Tree summary::before {
				  content: '\25B6'; /* right-pointing arrow */
				  padding-right: 8px;
				font-size: 70%;
				}
				.Tree details[open] summary::before {
				  content: '\25BC'; /* down-pointing arrow */
				}
				]]></style>
				<script type="importmap">{
	"imports": {
	"@codemirror/": "https://deno.land/x/codemirror_esm@v6.0.1/esm/",
	"@ui.js": "/lib/js/ui.js",
	"@ui/": "/lib/js/ui/"
	}
}</script>
			</head>
			<body>
				<xsl:for-each select="//ui:Component">
					<h2>Component: <xsl:value-of select="./@name"/></h2>
					<section>
						<div class="documentation" id="documentation">
							<pre style="display:none;">
								<xsl:value-of select="./ui:Description"/>
							</pre>
						</div>
						<script type="module"><![CDATA[
							import * as marked from 'https://esm.run/marked';
							const spaces = /^[ \t]+/;
							const node = document.getElementById("documentation")
							const lines = node.innerText.split("\n");
							const prefix = lines.reduce((r,v,i)=>{
								const p = v.match(spaces);
								const w = p ? p[0].length : 0;
								return p ? r === undefined ? w : Math.min(w,r) : r;
							}, undefined);
							const md = lines.map(_ => _.substr(prefix || 0)).join("\n")
							node.innerHTML = marked.parse(md);
						]]></script>
					</section>
					<section>
						<h3>Preview</h3>
						<div class="Preview">
							<div data-path="data">
								<xsl:attribute name="data-ui">
									<xsl:value-of select="@name"/>
								</xsl:attribute>
							</div>
						</div>
					</section>
					<section>
						<h3>View</h3>
						<div class="Tree">
							<xsl:apply-templates select="./ui:View/*" mode="tree"/>
						</div>
						<h4>Style</h4>
						<pre>
							<xsl:apply-templates select="./ui:Style/*" mode="css"/>
						</pre>
						<h4>Selectors</h4>
						<ul>
							<xsl:for-each select="./ui:View//@*">
								<li>
									<xsl:choose>
										<xsl:when test="starts-with(name(), 'out:content')">
											<code class="pill">
												<xsl:value-of select="name()"/>
											</code>
											<code>
												<xsl:value-of select="."/>
											</code>
										</xsl:when>
										<xsl:otherwise>
											<code class="pill">
												<xsl:value-of select="name()"/>
											</code>
											<code>
												<xsl:value-of select="."/>
											</code>
										</xsl:otherwise>
									</xsl:choose>
								</li>
							</xsl:for-each>
						</ul>
					</section>
					<section>
						<h3>Controller</h3>
						<xsl:for-each select="./ui:Controller">
							<pre>
								<code data-language="javascript">
									<xsl:value-of select="."/>
								</code>
							</pre>
							<script type="module">
								<xsl:value-of select="."/>
							</script>
						</xsl:for-each>
					</section>
					<section>
						<h3>Data</h3>
						<pre>
							<code id="data" data-language="javascript"/>
						</pre>
					</section>
					<div>
						<div class="template">
							<xsl:attribute name="id">
								<xsl:value-of select="@name"/>
							</xsl:attribute>
							<xsl:for-each select="ui:View">
								<xsl:for-each select="*|text()">
									<xsl:apply-templates select="." mode="copy"/>
								</xsl:for-each>
							</xsl:for-each>
						</div>
					</div>
				</xsl:for-each>
				<script type="module" data-skip="true">
					import {ui} from "@ui.js";
					const data={};
					<xsl:for-each select="//ui:Data">
						Object.assign(data, (<xsl:value-of select="."/>));
					</xsl:for-each>
					document.getElementById("data").innerText = JSON.stringify(data);
					ui(document, {data});
				</script>
				<script type="module" data-skip="true"><![CDATA[
					import jsBeautify from 'https://esm.run/js-beautify';
					for (let node of document.querySelectorAll("code[data-language]")){
						const raw=node.innerText;
				 		const fmt=jsBeautify(raw);
						const res = hljs.highlight(node.dataset.language, fmt);
						node.innerHTML = res.value;
					}
				]]></script>
			</body>
		</html>
	</xsl:template>
</xsl:stylesheet>
