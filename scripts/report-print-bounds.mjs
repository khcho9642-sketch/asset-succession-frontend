import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

/** Audit printable geometry before page.pdf(); hidden overflow must not hide a failure. */
export async function assertReportPrintBounds(page, { outputPath, label, expectedPages = 7 }) {
  const measured = await page.evaluate(() => {
    if (!window.matchMedia("print").matches) throw new Error("Report bounds must be measured in print media");
    const tolerance = 2;
    const rect = value => ({ top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height });
    const outside = (value, boundary) => value.top < boundary.top - tolerance || value.left < boundary.left - tolerance || value.right > boundary.right + tolerance || value.bottom > boundary.bottom + tolerance;
    const visible = element => {
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      }
      return element.getClientRects().length > 0;
    };
    const describe = element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${typeof element.className === "string" ? `.${element.className.trim().replace(/\s+/g, ".")}` : ""}`.slice(0, 200);
    return Array.from(document.querySelectorAll("[data-report-page]")).map(sheet => {
      const pageRect = rect(sheet.getBoundingClientRect());
      const style = getComputedStyle(sheet);
      const usableRect = {
        top: pageRect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
        right: pageRect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
        bottom: pageRect.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom),
        left: pageRect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      };
      const content = sheet.querySelector("[data-report-content]");
      const issues = [];
      let contentBottom = usableRect.top;
      let contentRight = usableRect.left;
      const checkRect = (value, kind, element, text = "") => {
        if (value.width <= 0 || value.height <= 0) return;
        contentBottom = Math.max(contentBottom, value.bottom);
        contentRight = Math.max(contentRight, value.right);
        if (outside(value, usableRect)) issues.push({ kind, element: describe(element), text: text.slice(0, 140), rect: rect(value), reason: "outside A4 usable bounds" });
      };
      if (!content) issues.push({ kind: "missing-content-marker" });
      if (Math.abs(pageRect.width - 210 / 25.4 * 96) > tolerance || Math.abs(pageRect.height - 297 / 25.4 * 96) > tolerance) issues.push({ kind: "non-A4-page-box", rect: pageRect });
      if (sheet.scrollHeight > sheet.clientHeight + tolerance || sheet.scrollWidth > sheet.clientWidth + tolerance) issues.push({ kind: "page-scroll-overflow", scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight, scrollWidth: sheet.scrollWidth, clientWidth: sheet.clientWidth });

      // Descendant rectangles remain outside their container even when an
      // ancestor uses overflow:hidden, unlike scrollHeight-only checks.
      for (const element of sheet.querySelectorAll("*")) {
        if (visible(element)) checkRect(element.getBoundingClientRect(), "element", element);
      }
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!node.textContent?.trim() || !parent || !visible(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const textRect of range.getClientRects()) {
          if (textRect.width <= 0 || textRect.height <= 0) continue;
          checkRect(textRect, "text", parent, node.textContent.trim());
          // Text can also be clipped by a smaller card or table wrapper while
          // still fitting the outer A4 sheet. Inspect every clipping ancestor.
          for (let ancestor = parent; ancestor && ancestor !== sheet; ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor);
            const clipsX = /^(hidden|clip|scroll|auto)$/.test(ancestorStyle.overflowX);
            const clipsY = /^(hidden|clip|scroll|auto)$/.test(ancestorStyle.overflowY);
            if (!clipsX && !clipsY) continue;
            const ancestorRect = ancestor.getBoundingClientRect();
            const clip = {
              left: ancestorRect.left + ancestor.clientLeft,
              top: ancestorRect.top + ancestor.clientTop,
              right: ancestorRect.left + ancestor.clientLeft + ancestor.clientWidth,
              bottom: ancestorRect.top + ancestor.clientTop + ancestor.clientHeight,
            };
            if ((clipsX && (textRect.left < clip.left - tolerance || textRect.right > clip.right + tolerance)) || (clipsY && (textRect.top < clip.top - tolerance || textRect.bottom > clip.bottom + tolerance))) {
              issues.push({ kind: "clipped-text", element: describe(parent), ancestor: describe(ancestor), text: node.textContent.trim().slice(0, 140), rect: rect(textRect), clip });
              break;
            }
          }
        }
      }
      return { page: sheet.getAttribute("data-report-page"), pageRect, usableRect, contentRect: content ? rect(content.getBoundingClientRect()) : null, contentBottom, contentRight, scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight, issueCount: issues.length, issues: issues.slice(0, 20) };
    });
  });
  const failures = measured.filter(sheet => sheet.issueCount > 0);
  const report = { status: measured.length === expectedPages && failures.length === 0 ? "passed" : "failed", label, expectedPages, tolerancePx: 2, pages: measured };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(measured.length, expectedPages, `${label}: unexpected report page count`);
  assert.deepEqual(failures, [], `${label}: printable content is clipped or outside usable A4 bounds; see ${outputPath}`);
  return report;
}
