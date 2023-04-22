<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs"  xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--
	## HTML Source

	Outputs the HTML tree as an XHTML source text.
	-->
	<xsl:template name="html-source">
		<xsl:param name="node"/>
		<xsl:apply-templates select="$node" mode="html-source"/>
	</xsl:template>
	<!-- Identity template -->
	<xsl:template match="@*|node()" mode="html-source">
		<xsl:copy>
			<xsl:apply-templates select="@*|node()" mode="html-source"/>
		</xsl:copy>
	</xsl:template>
	<!-- Format HTML elements -->
	<xsl:template match="*" mode="html-source">
		<xsl:text disable-output-escaping="yes">&lt;</xsl:text>
		<xsl:value-of select="name()"/>
		<xsl:apply-templates select="@*" mode="html-source"/>
		<xsl:text disable-output-escaping="yes">&gt;</xsl:text>
		<xsl:apply-templates mode="html-source"/>
		<xsl:text disable-output-escaping="yes">&lt;/</xsl:text>
		<xsl:value-of select="name()"/>
		<xsl:text disable-output-escaping="yes">&gt;</xsl:text>
	</xsl:template>
	<!-- Format attributes -->
	<xsl:template match="@*" mode="html-source">
		<xsl:text> </xsl:text>
		<xsl:value-of select="name()"/>
		<xsl:text>="</xsl:text>
		<xsl:value-of select="."/>
		<xsl:text>"</xsl:text>
	</xsl:template>

</xsl:stylesheet>
