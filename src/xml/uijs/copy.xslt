<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs"  xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--
## HTML Copy

	Outputs the XML tree as HTML, expanding the `x:` and  `s:` nodes.

	-->
	<xsl:template match="*" mode="copy">
		<xsl:choose>
			<xsl:when test="starts-with(name(), 's:')">
				<xsl:variable name="tag">
					<xsl:choose>
						<xsl:when test="@as"><xsl:value-of select="@as"/></xsl:when>
						<xsl:when test="starts-with(translate(local-name(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'AAAAAAAAAAAAAAAAAAAAAAAAAA'), 'A')">div</xsl:when>
						<xsl:otherwise>span</xsl:otherwise>
				</xsl:choose>
			</xsl:variable>

				<xsl:element name="{$tag}">

					<xsl:attribute name="class">
						<xsl:for-each select="ancestor-or-self::*[starts-with(name(),'s:')]">
							<xsl:if test="position()!=1">
								<xsl:text>-</xsl:text>
							</xsl:if>
							<xsl:value-of select="local-name()"/>
						</xsl:for-each>

						<xsl:if test="@class">
							<xsl:text> </xsl:text>
							<xsl:value-of select="@class"/>
						</xsl:if>
					</xsl:attribute>
					<xsl:for-each select="@*[name() != 'class']">
						<xsl:attribute name="{name()}">
							<xsl:value-of select="."/>
						</xsl:attribute>
					</xsl:for-each>
					<xsl:apply-templates select="*|text()" mode="copy"/>
				</xsl:element>
			</xsl:when>
			<!--
	`x:*` nodes act as a short hand to loading dynamic components
	-->
			<xsl:when test="starts-with(name(), 'x:')">
				<slot>
					<xsl:attribute name="out:content">
						<xsl:choose>
							<xsl:when test="@select">
								<xsl:value-of select="@select"/>
							</xsl:when>
							<xsl:otherwise>.</xsl:otherwise>
						</xsl:choose>
						<xsl:text>:</xsl:text>
						<xsl:value-of select="local-name()"/>
					</xsl:attribute>
				</slot>
			</xsl:when>
			<!--
	Regular nodes are applied as-is
	-->
			<xsl:otherwise>
				<xsl:element name="{name()}" namespace="http://www.w3.org/1999/xhtml">
					<xsl:for-each select="@*">
						<xsl:attribute name="{name()}">
							<xsl:value-of select="."/>
						</xsl:attribute>
					</xsl:for-each>
					<!-- Ensures that slot nodes are not empty -->
					<xsl:if test="name() = 'slot'"><xsl:text></xsl:text></xsl:if>
					<xsl:apply-templates select="*|text()" mode="copy"/>
				</xsl:element>
			</xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	<!--
	Text nodes are copied as-is -->
	<xsl:template match="text()" mode="copy">
		<xsl:value-of select="."/>
	</xsl:template>
</xsl:stylesheet>
