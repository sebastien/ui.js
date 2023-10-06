<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs#do" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs#on" xmlns:out="https://github.com/sebastien/uijs#out" xmlns:s="https://github.com/sebastien/uijs#s" xmlns:x="https://github.com/sebastien/uijs#x" version="1.0">
  <xsl:import href="uijs/css.xslt"/>
  <xsl:import href="uijs/source.xslt"/>
  <xsl:import href="uijs/tree.xslt"/>
  <xsl:import href="uijs/copy.xslt"/>
  <xsl:import href="uijs/applet.xslt"/>
  <xsl:import href="uijs/component.xslt"/>
  <xsl:import href="uijs/test.xslt"/>
  <xsl:output method="html" indent="no" encoding="UTF-8"/>
  <xsl:strip-space elements="*"/>
  <!--
	# UI.js Component Stylesheet

	Takes a UIjs XML component definition and creates an HTML file that
	displays the component.

	-->
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <xsl:variable name="componentsPath">
        <xsl:choose>
          <xsl:when test="/*/ui:import[@components]">
            <xsl:value-of select="/*/ui:import[@components and last()]/@components"/>
          </xsl:when>
          <xsl:otherwise>../components/</xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>
          <xsl:value-of select="//ui:Component/@name"/>
        </title>
        <!--
				Processes and includes the stylesheets. If no stylesheet, then
				the default uijs stylesheet is included.
				-->
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
        <!--
				We generate an import map, which we load first as any other
				module script would likely use it.
				-->
        <script type="importmap">
          <xsl:text>{"imports": {</xsl:text>
          <xsl:for-each select="/*/ui:import[@module!='']">
            <xsl:text>"</xsl:text>
            <xsl:value-of select="@module"/>
            <xsl:text>/": "</xsl:text>
            <xsl:choose>
              <xsl:when test="@path"><xsl:value-of select="@path"/>/</xsl:when>
              <xsl:otherwise>lib/js/<xsl:value-of select="substring-after(@module,'@')"/>/</xsl:otherwise>
            </xsl:choose>
            <xsl:text>",</xsl:text>
          </xsl:for-each>
          <xsl:text>"@codemirror/": "https://deno.land/x/codemirror_esm@v6.0.1/esm/",</xsl:text>
          <xsl:text>"@ui.js": "/lib/js/ui.js",</xsl:text>
          <xsl:text>"@ui/": "/lib/js/ui/",</xsl:text>
          <xsl:text>"@components/": "/lib/js/components/"}}</xsl:text>
        </script>
        <!--
				If we have at least one component that is not in the simple style
							-->
        <xsl:if test="//ui:Component[@mode!='simple']">
          <link href="/lib/css/uijs/components.css" rel="stylesheet"/>
          <script src="https://unpkg.com/highlightjs@9.16.2/highlight.pack.js"/>
          <link href="/lib/css/highlight-gold.css" rel="stylesheet"/>
        </xsl:if>
        <!-- ==========================================================
				Including the styles from the templates
				==========================================================- -->
        <xsl:if test="//s:*">
          <style data-template="true">
            <xsl:apply-templates select="//s:*" mode="css"/>
          </style>
        </xsl:if>
        <!--
				Non-module JavaScript imports
				-->
        <xsl:for-each select="/*/ui:import[not(@module)]">
          <script>
            <xsl:attribute name="src">
              <xsl:value-of select="@path"/>
            </xsl:attribute>
          </script>
        </xsl:for-each>
        <!-- This creates a script that loads the XML templates for the 
				dependencies referenced by `<x:XXX>` -->
        <xsl:if test="//*[starts-with(name(),'x:')]|/*/ui:import[@component]">
          <script type="module" data-template="true">
            <xsl:text>import {loadXMLTemplates} from "@ui/loading.js";loadXMLTemplates([...new Set([</xsl:text>
            <xsl:for-each select="//*[starts-with(name(),'x:')]">"<xsl:value-of select="$componentsPath"/><xsl:value-of select="local-name()"/>.xml",</xsl:for-each>
            <xsl:for-each select="/*/ui:import[@component]">"<xsl:choose><xsl:when test="@path"><xsl:value-of select="@path"/></xsl:when><xsl:otherwise><xsl:value-of select="$componentsPath"/></xsl:otherwise></xsl:choose><xsl:value-of select="@component"/>.xml",</xsl:for-each>
            <xsl:text>])]);</xsl:text>
          </script>
        </xsl:if>
        <!-- We include utilities used -->
        <xsl:if test="//ui:Component[@model!='simple']">
          <script><![CDATA[
						const renderCount = (value,parent) => 	{
							const items = Object.entries(value);
							return `${items.sort().map(([k,v]) => `<li><code>${k} ${v}</code></li>`).join("")}`; 
						}
						]]></script>
        </xsl:if>
      </head>
      <body class="reset">
        <xsl:apply-templates mode="component"/>
        <!-- Formats the JavaScript code examples to be nicer. -->
        <xsl:if test="//ui:Component[@mode!='simple']">
          <script type="module" data-skip="true"><![CDATA[
					import jsBeautify from 'https://esm.run/js-beautify';
					for (let node of document.querySelectorAll("code[data-language]")){
					const raw=node.innerText;
					const fmt=jsBeautify(raw);
					const res = hljs.highlight(node.dataset.language, fmt);
					node.innerHTML = res.value;
					}
					]]></script>
        </xsl:if>
      </body>
    </html>
  </xsl:template>
  <!-- ======================================================================

	## UI.js Script

	======================================================================= -->
  <xsl:template name="uijs-script">
    <xsl:param name="cid"/>
    <xsl:param name="scope"/>
    <!-- We include any script that is here, we mark it as skipped as it
		should not be included as part of the definition of the componenat -->
    <xsl:for-each select=".//ui:Script">
      <script type="module" data-skip="true">
        <xsl:value-of select="."/>
      </script>
    </xsl:for-each>
    <!-- Now, this is the main module that creates an instance of this component,
		obviously it should also be skipped. -->
    <script type="module" data-skip="true">
      <xsl:text>import {ui} from "@ui.js";
</xsl:text>
      <xsl:text>// We load the data
const data={};
</xsl:text>
      <xsl:for-each select=".//ui:Data">
        <xsl:if test="normalize-space(.)">Object.assign(data, (<xsl:value-of select="normalize-space(.)"/>));
</xsl:if>
      </xsl:for-each>
      <xsl:text>// We instanciate the components in scope with the data
const scope=(document.getElementById("</xsl:text>
      <xsl:value-of select="$scope"/>
      <xsl:text>")||document);
</xsl:text>
      <!-- Adding @raw to the UI will disable the JavaScript expansion -->
      <xsl:if test="/ui:UI[not(@raw)]">
        <xsl:text>ui(scope, {</xsl:text>
        <xsl:value-of select="$cid"/>
        <xsl:text>:data}, {}, {allowDuplicateTemplates:false});</xsl:text>
      </xsl:if>
    </script>
    <xsl:if test="//ui:Component[@mode!='simple']">
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
				}]]></script>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>
