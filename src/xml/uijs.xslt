<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs"  xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:import href="uijs/css.xslt"/>
	<xsl:import href="uijs/source.xslt"/>
	<xsl:import href="uijs/tree.xslt"/>
	<xsl:import href="uijs/copy.xslt"/>
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<xsl:strip-space elements="*" />
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
					<xsl:if test="//*[starts-with(name(),'x:')]">
						<section>
						Uses
						<ul class="list-h"><xsl:for-each select="//*[starts-with(name(),'x:')]"><li class="item pill"><a href="{local-name()}.xml"><xsl:value-of select="local-name()"/></a></li></xsl:for-each></ul>
					</section>
					</xsl:if>
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
						<div id="Preview" class="Preview">
							<div data-path="data">
								<xsl:attribute name="data-ui">
									<xsl:value-of select="@name"/>
								</xsl:attribute>
							</div>
						</div>
					</section>
					<xsl:if test="ui:Data/*|ui:Data/text()">
						<section>
							<h3>Data</h3>
							<pre>
								<code id="data" data-language="javascript"/>
							</pre>
						</section>
					</xsl:if>
					<section>
						<h3>View</h3>
						<div class="Tree">
							<xsl:apply-templates select="./ui:View/*" mode="tree"/>
						</div>
						<xsl:if test="*">
							<h4>Style</h4>
							<pre>
							<xsl:for-each select="//*[starts-with(name(),'s:')]">
								<xsl:apply-templates mode="css"/>
							</xsl:for-each>
							</pre>
							<style>
							<xsl:for-each select="//*[starts-with(name(),'s:')]">
								<xsl:apply-templates mode="css"/>
							</xsl:for-each>
							</style>
						</xsl:if>
						<xsl:if test="ui:View//@*">
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
						</xsl:if>
					</section>
					<xsl:if test="ui:Controller/*|ui:Controller/text()">
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
					</xsl:if>

					<div id="Template">
						<div class="template" data-keep="true">
							<xsl:attribute name="id">
								<xsl:value-of select="@name"/>
							</xsl:attribute>
							<xsl:for-each select="ui:View">
								<xsl:apply-templates select="*|text()" mode="copy"/>
							</xsl:for-each>
						</div>
					</div>
				</xsl:for-each>
				<!--
				We load implicitly referenced components and instanciante
				the component, using the data sample defined in the document.
				-->
				<script type="module" data-skip="true">
					<xsl:text><![CDATA[
					import {ui} from "@ui.js";
					import {loadXMLTemplates} from "@ui/loading.js";

					// We populate the data
					const data={};
					]]></xsl:text>
					<xsl:for-each select="//ui:Data">
						Object.assign(data, (<xsl:value-of select="."/>));
					</xsl:for-each>
					<xsl:text><![CDATA[
					document.getElementById("data").innerText = JSON.stringify(data);
					// We load the imported components as XML templates.
					loadXMLTemplates([...new Set([
					]]></xsl:text>
					<xsl:for-each select="//*[starts-with(name(),'x:')]"><xsl:if test="position()!=1">,</xsl:if>
						"./<xsl:value-of select="local-name()"/>.xml"
					</xsl:for-each>
					<xsl:text><![CDATA[
					])]).then((templates)=>{
						// And finally we render the nodes
						ui(document, {data});
					});
					]]></xsl:text>
				</script>
				<!--
				Formats the JavaScript code examples to be nicer.
				-->
				<script type="module" data-skip="true">
					import jsBeautify from 'https://esm.run/js-beautify';
					for (let node of document.querySelectorAll("code[data-language]")){
						const raw=node.innerText;
				 		const fmt=jsBeautify(raw);
						const res = hljs.highlight(node.dataset.language, fmt);
						node.innerHTML = res.value;
					}
				</script>
			</body>
		</html>
	</xsl:template>
</xsl:stylesheet>
