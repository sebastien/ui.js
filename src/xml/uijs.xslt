<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs#do" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs#on" xmlns:out="https://github.com/sebastien/uijs#out" xmlns:s="https://github.com/sebastien/uijs#s" xmlns:x="https://github.com/sebastien/uijs#x" version="1.0">
	<xsl:import href="uijs/css.xslt"/>
	<xsl:import href="uijs/source.xslt"/>
	<xsl:import href="uijs/tree.xslt"/>
	<xsl:import href="uijs/copy.xslt"/>
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<xsl:strip-space elements="*"/>
	<!--
	# UI.js Component Stylesheet

	Takes a UIjs XML component definition and creates an HTML file that
	displays the component.

	-->
	<xsl:template match="/">
		<html xmlns="http://www.w3.org/1999/xhtml">
			<head>
				<title>
					<xsl:value-of select="//ui:Component/@name"/>
				</title>
				<meta charset="utf-8"/>
				<meta name="viewport" content="width=device-width, initial-scale=1"/>
				<xsl:choose>
					<xsl:when test="//ui:Component/ui:stylesheet">
						<xsl:for-each select="//ui:Component/ui:stylesheet">
							<link rel="stylesheet">
								<xsl:attribute name="href">
									<xsl:value-of select="@src"/>
								</xsl:attribute>
							</link>
						</xsl:for-each>
					</xsl:when>
					<xsl:otherwise>
						<link href="/lib/css/uijs.css" rel="stylesheet"/>
					</xsl:otherwise>
				</xsl:choose>
				<xsl:if test="//ui:Component">
					<link href="/lib/css/uijs/components.css" rel="stylesheet"/>
					<script src="https://unpkg.com/highlightjs@9.16.2/highlight.pack.js"/>
					<link href="/lib/css/highlight-gold.css" rel="stylesheet"/>
				</xsl:if>
				<script type="importmap">
					{"imports": {
					<xsl:for-each select="/*/ui:import">
						"<xsl:value-of select="@module"/>/": "<xsl:choose><xsl:when test="@path"><xsl:value-of select="@path"/>/</xsl:when><xsl:otherwise>lib/js/<xsl:value-of select="substring-after(@module,'@')"/>/</xsl:otherwise></xsl:choose>",
					</xsl:for-each>
					"@codemirror/": "https://deno.land/x/codemirror_esm@v6.0.1/esm/",
					"@ui.js": "/lib/js/ui.js",
					"@ui/": "/lib/js/ui/",
					"@components/": "/lib/js/components/"
					}}
				</script>
				<style data-template="true">
					<xsl:apply-templates select="//s:*" mode="css"/>
				</style>
			</head>
			<body>
				<xsl:if test="//ui:Component">
					<script><![CDATA[
						const renderCount = (value,parent) => 	{
							const items = Object.entries(value);
							return `${items.sort().map(([k,v]) => `<li><code>${k} ${v}</code></li>`).join("")}`; 
						}
						]]></script>
				</xsl:if>
				<xsl:apply-templates mode="component"/>
				<!--
		Formats the JavaScript code examples to be nicer.
		-->
				<xsl:if test="//ui:Component">
					<script type="module" data-skip="true">
			import jsBeautify from 'https://esm.run/js-beautify';
			for (let node of document.querySelectorAll("code[data-language]")){
				const raw=node.innerText;
				const fmt=jsBeautify(raw);
				const res = hljs.highlight(node.dataset.language, fmt);
				node.innerHTML = res.value;
			}
		</script>
				</xsl:if>
			</body>
		</html>
	</xsl:template>
	<xsl:template match="ui:Applet" mode="component">
		<div data-path="data">
			<xsl:attribute name="data-ui">
				<xsl:value-of select="@name"/>
			</xsl:attribute>
		</div>
		<template data-keep="true">
			<xsl:attribute name="id">
				<xsl:value-of select="@name"/>
			</xsl:attribute>
			<xsl:for-each select="ui:View">
				<xsl:apply-templates select="*|text()" mode="copy"/>
			</xsl:for-each>
		</template>
	</xsl:template>
	<!--
	## UI Component
	-->
	<xsl:template match="ui:Component" mode="component">
		<xsl:variable name="cid" select="generate-id(.)"/>
		<section class="Component">
			<xsl:attribute name="id">
				<xsl:value-of select="concat('component_',$cid)"/>
			</xsl:attribute>
			<xsl:if test="@controller">
				<script type="module">import <xsl:value-of select="@name"/> from "<xsl:value-of select="@controller"/>";</script>
			</xsl:if>
			<h2>
				<xsl:value-of select="./@name"/>
			</h2>
			<xsl:if test="//*[starts-with(name(),'x:')]">
				<section>
			Uses
			<ul class="list-h"><xsl:for-each select="//*[starts-with(name(),'x:')]"><li class="item pill"><a href="{local-name()}.xml"><xsl:value-of select="local-name()"/></a></li></xsl:for-each></ul>
			</section>
			</xsl:if>
			<section>
				<!-- FIXME: We should not use Ids here with fixed values -->
				<div class="documentation">
					<pre>
						<xsl:value-of select="./ui:Description"/>
					</pre>
				</div>
			</section>
			<section>
				<h3>Preview</h3>
				<div class="Preview">
					<xsl:attribute name="id">
						<xsl:value-of select="concat('preview_',$cid)"/>
					</xsl:attribute>
					<xsl:attribute name="style">
						<xsl:value-of select="./ui:View/@style"/>
					</xsl:attribute>
					<div>
						<xsl:attribute name="data-path">
							<xsl:value-of select="concat('data_',$cid)"/>
						</xsl:attribute>
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
						<code data-language="javascript">
							<xsl:attribute name="id">
								<xsl:value-of select="concat('data_',$cid)"/>
							</xsl:attribute>
						</code>
					</pre>
				</section>
			</xsl:if>
			<section>
				<h3>View</h3>
				<div class="Columns">
					<article>
						<h4>HTML</h4>
						<div class="Tree">
							<xsl:apply-templates select="./ui:View/*" mode="tree"/>
						</div>
					</article>
					<xsl:if test="ui:View//@class">
						<article>
							<h4>CSS Classes</h4>
							<ul>
								<xsl:attribute name="id">
									<xsl:value-of select="concat('selectors_',$cid)"/>
								</xsl:attribute>
							</ul>
							<script>
							{
							const cid="<xsl:value-of select="$cid"/>";
							const classNames="<xsl:for-each select="./ui:View//@class"><xsl:value-of select="."/>|</xsl:for-each>"; <![CDATA[
							const classes=classNames.replaceAll(" ","|").split("|").reduce((r,v)=>(v.trim().length && (r[v]=(r[v]||0)+1),r), {});
							document.getElementById(`selectors_${cid}`).innerHTML = renderCount(classes);
							]]>
							}
						</script>
						</article>
					</xsl:if>
					<xsl:if test="./ui:View//s:*/@*[name() != 'class']">
						<article>
							<h4>CSS Tokens</h4>
							<ul>
								<xsl:attribute name="id">
									<xsl:value-of select="concat('tokens_',$cid)"/>
								</xsl:attribute>
							</ul>
							<script>
							{
							const cid="<xsl:value-of select="$cid"/>";
							const tokenNames=`<xsl:for-each select="./ui:View//s:*/@*"><xsl:value-of select="."/>|</xsl:for-each>`;
							<![CDATA[
							const vars = /var\((.*?)\)/g;
							const matches = {};
							let match;
							while ((match = vars.exec(tokenNames)) !== null) {matches[match[1]] = (matches[matches[1]]||0)+1;}
							document.getElementById(`tokens_${cid}`).innerHTML = renderCount(matches);
							]]>
							}
						</script>
						</article>
					</xsl:if>
				</div>
				<xsl:if test="//s:*|//ui:Style">
					<article>
						<h4>CSS</h4>
						<pre>
							<xsl:apply-templates select="//ui:Style/*" mode="css"/>
							<xsl:apply-templates select="//s:*" mode="css"/>
						</pre>
						<style>
							<xsl:apply-templates select="//ui:Style/*" mode="css"/>
							<xsl:apply-templates select="//s:*" mode="css"/>
						</style>
					</article>
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
						<script data-template="true" type="module">
							<xsl:text>import {controller} from "@ui.js";</xsl:text>
							<xsl:value-of select="."/>
						</script>
					</xsl:for-each>
				</section>
			</xsl:if>
			<!-- This is the UIJS template, which we keep so that we can
			introspect it -->
			<div style="display: none">
				<xsl:attribute name="id">
					<xsl:value-of select="concat('template_',$cid)"/>
				</xsl:attribute>
				<div class="template" data-keep="true">
					<xsl:attribute name="id">
						<xsl:value-of select="@name"/>
					</xsl:attribute>
					<xsl:for-each select="ui:View">
						<xsl:apply-templates select="*|text()" mode="copy"/>
					</xsl:for-each>
				</div>
			</div>
			<!--
		We load implicitly referenced components and instanciante
		the component, using the data sample defined in the document.
		-->
			<xsl:call-template name="uijs-script">
				<xsl:with-param name="cid" select="$cid"/>
			</xsl:call-template>
		</section>
	</xsl:template>
	<!--
	## UI.js Script
-->
	<xsl:template name="uijs-script">
		<xsl:param name="cid"/>
		<section class="Scripts">
			<xsl:for-each select=".//ui:Script">
				<script type="module" data-skip="true">
					<xsl:value-of select="."/>
				</script>
			</xsl:for-each>
			<!-- This creates a script that loads the XML templates for the 
		dependencies -->
			<script id="uijs-component-dependencies" type="module" data-template="true">
				<xsl:text>import {loadXMLTemplates} from "@ui/loading.js";loadXMLTemplates([...new Set([</xsl:text>
				<xsl:for-each select=".//*[starts-with(name(),'x:')]"><xsl:if test="position()!=1">,</xsl:if>
			"../components/<xsl:value-of select="local-name()"/>.xml"
		</xsl:for-each>
				<xsl:text>])]);</xsl:text>
			</script>
			<script id="script-anchor" type="module" data-skip="true">
				<xsl:text>
import {ui} from "@ui.js";
// We populate the data
const data={};
				</xsl:text>
				<xsl:for-each select=".//ui:Data">
					<xsl:if test="normalize-space(.)">
Object.assign(data, (<xsl:value-of select="."/>));
					</xsl:if>
				</xsl:for-each>
				<xsl:text>const scope=(</xsl:text>
				<xsl:value-of select="concat('preview_', $cid)"/>
				<xsl:text>);</xsl:text>
				<xsl:text>const dataElement = document.getElementById("data_</xsl:text>
				<xsl:value-of select="$cid"/>
				<xsl:text>");
if (dataElement){
	dataElement.innerText = JSON.stringify(data);
}
// FIXME: This only works if the loadXMLTemplate was run before
// this.
// We load the imported components as XML templates.
ui(scope, {data_</xsl:text>
				<xsl:value-of select="$cid"/>
				<xsl:text>:data}, {}, {allowDuplicateTemplates:true});</xsl:text>
			</script>
			<script type="module" data-skip="true"><![CDATA[
			import * as marked from 'https://esm.run/marked';
			const spaces = /^[ \t]+/;
			for (const node of document.getElementsByClassName("documentation")) {
				const lines = node.innerText.split("\n");
				const prefix = lines.reduce((r,v,i)=>{
				const p = v.match(spaces);
				const w = p ? p[0].length : 0;
				return p ? r === undefined ? w : Math.min(w,r) : r;
				}, undefined);
				const md = lines.map(_ => _.substr(prefix || 0)).join("\n")
				node.innerHTML = marked.parse(md, {mangle:false, headerIds:false});
			}
			]]></script>
		</section>
	</xsl:template>
</xsl:stylesheet>
