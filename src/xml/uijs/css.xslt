<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--
	## CSS Rendering

	Renders the `<Style>...</Style>` content.
	-->
	<xsl:template match="s:*" mode="css">
		<xsl:for-each select="ancestor-or-self::*[starts-with(name(),'s:')]">
			<xsl:if test="position()!=1">
				<xsl:text>-</xsl:text>
			</xsl:if>
			<xsl:value-of select="local-name()"/>
		</xsl:for-each>
		<xsl:text>{</xsl:text>
		<xsl:for-each select="@*[ name() != 'select' ]">
			<xsl:text>  </xsl:text>
			<xsl:value-of select="name()"/>
			<xsl:text>: </xsl:text>
			<xsl:value-of select="."/>
			<xsl:text>;</xsl:text>
		</xsl:for-each>
		<xsl:text>}
</xsl:text>
		<xsl:apply-templates select="*" mode="css"/>
	</xsl:template>
	<xsl:template match="text()" mode="css">
		<xsl:value-of select="."/>
	</xsl:template>
</xsl:stylesheet>
