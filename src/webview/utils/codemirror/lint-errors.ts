
let activeTooltip: any = null;

function getLintErrorsForLine(editor: any, lineNumber: any) {
  if (!editor) return [];

  const errors: any = [];
  const lintState = editor.state.lint;

  if (lintState && lintState.marked) {
    lintState.marked.forEach((mark: any) => {
      if (mark.__annotation) {
        const annotationLine = mark.__annotation.from?.line;

        if (annotationLine === lineNumber) {
          if (!errors.find((e: any) => e.message === mark.__annotation.message)) {
            errors.push(mark.__annotation);
          }
        }
      }
    });
  }

  return errors;
}

/**
 * @param {Array} errors - Array of lint error annotations
 * @param {HTMLElement} targetElement - The element to position the tooltip near
 * @param {HTMLElement} container - The container to append the tooltip to
 */
function showLintTooltip(errors: any, targetElement: any, container: any) {
  hideLintTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'lint-error-tooltip';

  errors.forEach((error: any, index: any) => {
    const errorDiv = document.createElement('div');
    errorDiv.className = `lint-tooltip-message ${error.severity || 'error'}`;
    errorDiv.textContent = error.message;
    tooltip.appendChild(errorDiv);
  });

  container.appendChild(tooltip);
  activeTooltip = tooltip;

  const rect = targetElement.getBoundingClientRect();
  tooltip.style.left = `${rect.right + 8}px`;
  tooltip.style.top = `${rect.top + (rect.height / 2)}px`;
  tooltip.style.transform = 'translateY(-50%)';
}

/**
 * Hide and remove the active lint error tooltip
 */
function hideLintTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

/**
 * Setup lint error tooltip functionality for a CodeMirror editor
 *
 * @param {CodeMirror} editor - The CodeMirror editor instance
 * @returns {Function} Cleanup function to remove event listeners
 */
export function setupLintErrorTooltip(editor: any): unknown {
  const wrapper = editor.getWrapperElement();
  const container = wrapper.closest('.graphiql-container') || wrapper.parentElement;

  const handleMouseOver = (e: any) => {
    const target = e.target;

    if (target.classList.contains('CodeMirror-linenumber')) {
      const lineNumber = parseInt(target.textContent, 10) - 1; // 0-indexed

      if (isNaN(lineNumber) || lineNumber < 0) {
        hideLintTooltip();
        return;
      }

      const lintErrors = getLintErrorsForLine(editor, lineNumber);

      if (lintErrors.length > 0) {
        showLintTooltip(lintErrors, target, container);
      } else {
        hideLintTooltip();
      }
    } else if (!target.closest('.lint-error-tooltip')) {
      hideLintTooltip();
    }
  };

  const handleMouseOut = (e: any) => {
    const relatedTarget = e.relatedTarget;
    // Don't hide if moving to another line number or the tooltip
    if (relatedTarget
      && (relatedTarget.classList?.contains('CodeMirror-linenumber')
        || relatedTarget.closest?.('.lint-error-tooltip'))) {
      return;
    }
    hideLintTooltip();
  };

  const handleScroll = () => {
    hideLintTooltip();
  };

  wrapper.addEventListener('mouseover', handleMouseOver);
  wrapper.addEventListener('mouseout', handleMouseOut);
  editor.on('scroll', handleScroll);

  return () => {
    wrapper.removeEventListener('mouseover', handleMouseOver);
    wrapper.removeEventListener('mouseout', handleMouseOut);
    editor.off('scroll', handleScroll);
    hideLintTooltip();
  };
}
