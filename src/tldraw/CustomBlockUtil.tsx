import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';
import React, { useState, useEffect } from 'react';
import { CustomBlockShape } from './CustomBlockShape';

// Lightweight observable to bridge editing states between Canvas and ShapeUtil
let activeEditingBlockId: string | null = null;
const editingListeners = new Set<(id: string | null) => void>();

export const getEditingBlockId = () => activeEditingBlockId;

export const setEditingBlockId = (id: string | null) => {
  activeEditingBlockId = id;
  editingListeners.forEach((l) => l(id));
};

export const subscribeToEditingBlock = (listener: (id: string | null) => void) => {
  editingListeners.add(listener);
  return () => {
    editingListeners.delete(listener);
  };
};

export class CustomBlockUtil extends BaseBoxShapeUtil<any> {
  static override type = 'block' as const;

  override canBind = () => true; // Allows arrows to connect to block edges
  override canResize = () => true;

  override getDefaultProps() {
    return {
      blockId: '',
      w: 300,
      h: 180,
    };
  }

  override getIndicatorPath(shape: any): any {
    const w = shape.props.w;
    const h = shape.props.h;
    const pathCommands = `M 0 0 h ${w} v ${h} h ${-w} z`;
    if (typeof Path2D !== 'undefined') {
      return new Path2D(pathCommands);
    }
    return {
      commands: pathCommands,
      rect: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
    } as any;
  }

  // React component representing the visual output of the shape
  override component(shape: any) {
    const blockId = shape.props.blockId;
    const [isEditing, setIsEditing] = useState(getEditingBlockId() === blockId);

    useEffect(() => {
      const unsubscribe = subscribeToEditingBlock((id) => {
        setIsEditing(id === blockId);
      });
      return unsubscribe;
    }, [blockId]);

    return (
      <HTMLContainer style={{ pointerEvents: 'all', width: '100%', height: '100%' }}>
        <CustomBlockShape
          blockId={blockId}
          isEditing={isEditing}
          setEditingBlockId={setEditingBlockId}
          editorRefInstance={this.editor}
        />
      </HTMLContainer>
    );
  }

  // Visual border box rendered during shape dragging and drawing guides
  override indicator(shape: any) {
    return <rect className="stroke-violet-500 stroke-2 fill-none" width={shape.props.w} height={shape.props.h} rx="12" />;
  }
}
