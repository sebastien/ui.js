<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--

	## HTML Copy

	Outputs the XML tree as HTML, expanding the `x:` and  `s:` nodes.

	-->
	<xsl:template match="*" mode="copy">
		<xsl:choose>
			<!-- `x:XXX` nodes are expanded to `<div data-ui="XXX">` -->
			<xsl:when test="starts-with(name(),'x:')">
				<slot>
					<xsl:attribute name="out:content">
						<xsl:value-of select="@select"/>
						<xsl:text>:</xsl:text>
						<xsl:value-of select="local-name()"/>
					</xsl:attribute>
				</slot>
			</xsl:when>
			<!-- `s:XXX` nodes are expanded to `<div class="XXX">`, which makes
			the code much more compact. -->
			<xsl:when test="starts-with(name(),'s:')">
				<!--
				<xsl:element name="{(@as or 'div'}" namespace="http://www.w3.org/1999/xhtml">
					<xsl:attribute name="class">
						<xsl:value-of select="local-name()" />
						<xsl:if test="@class"><xsl:text> </xsl:text><xsl:value-of select="@class" /></xsl:if>
					</xsl:attribute>
					<xsl:for-each select="@*[name() != 'class']">
						<xsl:attribute name="{name()}">
							<xsl:value-of select="."/>
						</xsl:attribute>
					</xsl:for-each>
					<xsl:apply-templates select="*|text()" mode="copy"/>
				</xsl:element>
				-->
			</xsl:when>
			<xsl:otherwise>
				<xsl:element name="{name()}" namespace="http://www.w3.org/1999/xhtml">
					<xsl:for-each select="@*">
						<xsl:attribute name="{name()}">
							<xsl:value-of select="."/>
						</xsl:attribute>
					</xsl:for-each>
					<xsl:apply-templates select="*|text()" mode="copy"/>
				</xsl:element>
			</xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	<xsl:template match="text()" mode="copy">
		<xsl:value-of select="."/>
	</xsl:template>
	<xsl:template match="@*" mode="copy">
		<xsl:attribute name="{name()}">
			<xsl:value-of select="."/>
		</xsl:attribute>
	</xsl:template>
</xsl:stylesheet>
