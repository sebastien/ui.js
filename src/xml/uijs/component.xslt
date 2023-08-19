<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs#do" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs#on" xmlns:out="https://github.com/sebastien/uijs#out" xmlns:s="https://github.com/sebastien/uijs#s" xmlns:x="https://github.com/sebastien/uijs#x" version="1.0">
	<!-- ======================================================================

	## UI Component

	======================================================================= -->
	<xsl:template match="ui:Component" mode="component">
		<xsl:variable name="cid" select="@name"/>
		<!-- This injects the documentation if neede -->
		<xsl:choose>
			<xsl:when test="@mode='simple'">
				<div data-path="{@name}" data-ui="{@name}">Loading…</div>
			</xsl:when>
			<xsl:otherwise>
				<xsl:apply-templates mode="component-doc"/>
			</xsl:otherwise>
		</xsl:choose>
		<!-- This is the UIJS template, which we keep so that we can
			introspect it -->
		<template name="{@name}" data-keep="true">
			<!-- We inject the views -->
			<xsl:for-each select="ui:View">
				<xsl:apply-templates select="*|text()" mode="copy"/>
			</xsl:for-each>
			<!-- We include the styles in the template -->
			<style>
				<xsl:apply-templates select=".//ui:Style/*" mode="css"/>
				<xsl:apply-templates select=".//s:*" mode="css"/>
			</style>
			<!-- We inject the controllers, if any -->
			<xsl:if test="ui:Controller/*|ui:Controller/text()">
				<script data-template="true" type="module">
					<xsl:text>import {controller} from "@ui.js";</xsl:text>
					<xsl:for-each select="./ui:Controller">
						<xsl:value-of select="."/>
					</xsl:for-each>
				</script>
			</xsl:if>
		</template>
		<!-- We load the controller code, if specified -->
		<xsl:if test="@controller">
			<script type="module" data-template="true">// Imports the controller of this component&#10;import <xsl:value-of select="@name"/> from "<xsl:value-of select="@controller"/>";</script>
		</xsl:if>
		<!--
			We load implicitly referenced components and instanciate
			the component, using the data sample defined in the document. -->
		<xsl:call-template name="uijs-script">
			<xsl:with-param name="cid" select="$cid"/>
			<xsl:with-param name="scope" select="concat($cid,'Container')"/>
		</xsl:call-template>
	</xsl:template>
	<!-- ======================================================================

	## Docs

	======================================================================= -->
	<xsl:template match="ui:Component" mode="component-doc">
		<h2>
			<xsl:value-of select="./@name"/>
		</h2>
		<xsl:if test="//*[starts-with(name(),'x:')]">
			<section>
			Uses
			<ul class="list-h"><xsl:for-each select="//*[starts-with(name(),'x:')]"><li class="item pill"><a href="{local-name()}.xml"><xsl:value-of select="local-name()"/></a></li></xsl:for-each></ul>
			</section>
		</xsl:if>
		<!-- ## Documentation -->
		<section>
			<!-- FIXME: We should not use Ids here with fixed values -->
			<div class="documentation">
				<pre>
					<xsl:value-of select="./ui:Description"/>
				</pre>
			</div>
		</section>
		<!-- ## Preview -->
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
		<!-- ## Data Preview -->
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
		<!-- ## View Definition -->
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
				</article>
			</xsl:if>
		</section>
		<!-- ## Controller Definition -->
		<xsl:if test="ui:Controller/*|ui:Controller/text()">
			<section>
				<h3>Controller</h3>
				<xsl:for-each select="./ui:Controller">
					<pre>
						<code data-language="javascript">
							<xsl:value-of select="."/>
						</code>
					</pre>
				</xsl:for-each>
			</section>
		</xsl:if>
	</xsl:template>
</xsl:stylesheet>
