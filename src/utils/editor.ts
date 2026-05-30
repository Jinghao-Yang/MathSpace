/**
 * 共享的编辑器工具函数
 */

/**
 * 从 mathEnvironment 节点内容中提取 \label{...}，并设置到节点属性上
 * @param editor Tiptap 编辑器实例
 * @returns 提取到的标签，如果没有则返回 null
 */
export function extractAndSetLabels(editor: any): string | null {
  const { state, view } = editor;
  const { tr } = state;
  let hasChanges = false;
  let labelForBlock: string | null = null;

  state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'mathEnvironment') {
      let envLabel = node.attrs.label || '';
      node.descendants((child: any, childPos: number) => {
        if (child.isText && child.text) {
          const regex = /\\label\{([a-zA-Z0-9_-]+)\}/g;
          const match = regex.exec(child.text);
          if (match) {
            envLabel = match[1];
            labelForBlock = envLabel;
            const cleanedText = child.text.replace(regex, '').trim();
            const absolutePos = pos + 1 + childPos;
            tr.insertText(cleanedText, absolutePos, absolutePos + child.text.length);
            hasChanges = true;
          }
        }
      });

      if (envLabel !== node.attrs.label) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          label: envLabel,
        });
        hasChanges = true;
      }
    }
  });

  if (hasChanges) {
    view.dispatch(tr);
  }

  return labelForBlock;
}
