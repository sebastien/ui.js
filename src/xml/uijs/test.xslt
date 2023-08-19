<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs#do" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs#on" xmlns:out="https://github.com/sebastien/uijs#out" xmlns:s="https://github.com/sebastien/uijs#s" xmlns:x="https://github.com/sebastien/uijs#x" version="1.0">
	<!--
	===========================================================================

	## UI Test

	===========================================================================
	-->
	<xsl:template match="ui:Test" mode="component">
		<xsl:variable name="id" select="generate-id(.)"/>
		<h1>Test</h1>
		<section>
			<xsl:attribute name="id">
				<xsl:value-of select="concat('test-', $id)"/>
			</xsl:attribute>
			<header>
				<h1>
					<xsl:value-of select="@name"/>
				</h1>
			</header>
			<table>
				<thead>
				</thead>
				<tbody>
					<tr>
						<td>
							<div>
								<xsl:attribute name="data-ui">
									<xsl:value-of select="$id"/>
								</xsl:attribute>
								<xsl:attribute name="data-path">
									<xsl:value-of select="$id"/>
								</xsl:attribute>
							</div>
						</td>
						<td>
							<div>
								<xsl:for-each select="./ui:Expected">
									<xsl:copy-of select="current()"/>
								</xsl:for-each>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
			<template data-keep="true">
				<xsl:attribute name="name">
					<xsl:value-of select="$id"/>
				</xsl:attribute>
				<xsl:for-each select="./ui:Template">
					<xsl:apply-templates select="*|text()" mode="copy"/>
				</xsl:for-each>
			</template>
			<script type="module">
      import ui from "@ui.js";
	  const scope = document.getElementById("test-<xsl:value-of select="$id"/>");
      ui(scope);
    </script>
		</section>
	</xsl:template>
</xsl:stylesheet>
