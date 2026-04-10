<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs#do" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs#on" xmlns:out="https://github.com/sebastien/uijs#out" xmlns:s="https://github.com/sebastien/uijs#s" xmlns:x="https://github.com/sebastien/uijs#x" version="1.0">
	<!--
	===========================================================================

	## UI Applet

	===========================================================================
	-->
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
		<xsl:call-template name="uijs-script">
			<xsl:with-param name="cid" select="generate-id(.)"/>
		</xsl:call-template>
	</xsl:template>
</xsl:stylesheet>
