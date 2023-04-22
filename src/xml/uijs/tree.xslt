<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1999/xhtml" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ui="https://github.com/sebastien/uijs" xmlns:on="https://github.com/sebastien/uijs" xmlns:out="https://github.com/sebastien/uijs" xmlns:s="https://github.com/sebastien/uijs" xmlns:x="https://github.com/sebastien/uijs" version="1.0">
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
							<xsl:apply-templates select="." mode="tree"/>
						</li>
					</xsl:for-each>
				</ul>
			</xsl:if>
		</details>
	</xsl:template>

</xsl:stylesheet>
