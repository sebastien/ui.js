<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:do="https://github.com/sebastien/uijs#do"  xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs#on" xmlns:out="https://github.com/sebastien/uijs#out" xmlns:s="https://github.com/sebastien/uijs#s" xmlns:x="https://github.com/sebastien/uijs#x" version="1.0">
	<xsl:output method="html" indent="no" encoding="UTF-8"/>
	<!--

	## Tree mode

	Outputs the XML tree using THML `details` and `summary` tags.

	-->
	<xsl:template match="*" mode="tree">
		<details>
			<summary>
				<code class="name">
					<xsl:value-of select="name()"/>
				</code>
				<xsl:if test="@class">
					<code class="class">
						<xsl:value-of select="@class"/>
					</code>
				</xsl:if>
			</summary>
			<xsl:if test="./@*[name() != 'class']">
				<ul class="attributes">
					<xsl:for-each select="./@*[name() != 'class']">
						<li class="attribute">
							<strong>
								<xsl:value-of select="name()"/>
							</strong>
							<code>
								<xsl:value-of select="."/>
							</code>
						</li>
					</xsl:for-each>
				</ul>
			</xsl:if>
			<xsl:if test="./text()|./*">
				<ul class="children">
					<xsl:for-each select="./text()|./*">
						<li class="child">
							<xsl:if test="self::text()">
								<xsl:attribute name="class">child text</xsl:attribute>
							</xsl:if>
							<xsl:apply-templates select="." mode="tree"/>
						</li>
					</xsl:for-each>
				</ul>
			</xsl:if>
		</details>
	</xsl:template>

</xsl:stylesheet>
