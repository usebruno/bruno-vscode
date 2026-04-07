import React from 'react';
import { useDrag, useDrop } from 'react-dnd';

interface DraggableTabProps {
  id?: string;
  onMoveTab?: (...args: unknown[]) => void;
  index?: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: (...args: unknown[]) => void;
}


const DraggableTab = ({
  id,
  onMoveTab,
  index,
  children,
  className,
  onClick
}: any) => {
  const ref = React.useRef(null);

  const [{ handlerId, isOver }, drop] = useDrop({
    accept: 'tab',
    hover(item: { id: string }, monitor) {
      onMoveTab(item.id, id);
    },
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
      isOver: monitor.isOver()
    })
  });

  const [{ isDragging }, drag] = useDrag({
    type: 'tab',
    item: () => {
      return { id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    options: {
      dropEffect: 'move'
    }
  });

  drag(drop(ref));

  return (
    <li
      className={className}
      ref={ref}
      role="tab"
      style={{ opacity: isDragging || isOver ? 0 : 1 }}
      onClick={onClick}
      data-handler-id={handlerId}
    >
      {children}
    </li>
  );
};

export default DraggableTab;
