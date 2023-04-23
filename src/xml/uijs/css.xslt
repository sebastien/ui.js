<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xsl:stylesheet [
  <!ENTITY eol "&#10;">
]>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--
	## CSS Rendering

	Renders the `<Style>...</Style>` content.
	-->
	<xsl:template match="*[starts-with(name(),'s:')]" mode="css">
		<xsl:if test="@*[ name() != 'select' and name() != 'class' and name() != 'as' and not(starts-with(name(),'on:')) and not(starts-with(name(),'out:')) and not(starts-with(name(),'data-'))]">
			<xsl:call-template name="css-selector"/>
			<xsl:call-template name="css-properties"/>
		</xsl:if>
	</xsl:template>
	<!--
		`s:_` nodes are anonymous nodes, meaning that they override the current
	  style node with specific cases.
	-->
	<xsl:template match="*[name() = 's:_']" mode="css">
		<xsl:for-each select="ancestor::s:*[1]">
			<xsl:call-template name="css-selector"/>
		</xsl:for-each>
		<xsl:value-of select="@select"/>
		<xsl:call-template name="css-properties"/>
	</xsl:template>
	<!--
		Outputs the CSS selector for the current node, by looking at its' ancestor
  	`s:` nodes.
	-->
	<xsl:template name="css-selector">
		<xsl:text>.</xsl:text>
		<xsl:for-each select="ancestor-or-self::*[starts-with(name(),'s:')]">
			<xsl:if test="position()!=1">
				<xsl:text>-</xsl:text>
			</xsl:if>
			<xsl:value-of select="local-name()"/>
		</xsl:for-each>
	</xsl:template>
	<!--
		Outputs the CSS properties of the given node, which are defined
	  as attributes.
	-->
	<xsl:template name="css-properties">
		<xsl:text>{</xsl:text>
		<xsl:for-each select="@*[ name() != 'select' and name() != 'class' and name() != 'as' and not(starts-with(name(),'on:')) and not(starts-with(name(),'out:')) and not(starts-with(name(),'data-'))]">
			<xsl:value-of select="name()"/>
			<xsl:text>:</xsl:text>
			<xsl:value-of select="."/>
			<xsl:text>;</xsl:text>
		</xsl:for-each>
		<xsl:text>}&eol;</xsl:text>
	</xsl:template>
</xsl:stylesheet>
