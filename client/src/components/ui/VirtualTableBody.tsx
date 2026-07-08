import React, { useState, useEffect, useRef } from 'react';

interface VirtualTableBodyProps<T> {
  items: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  rowHeight: number;
  containerHeight?: number; // Optional: If not provided, it will use window scrolling or parent container
  className?: string;
  emptyState?: React.ReactNode;
}

export function VirtualTableBody<T>({
  items,
  renderRow,
  rowHeight,
  containerHeight = 600,
  className = '',
  emptyState
}: VirtualTableBodyProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
      }
    };
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  if (items.length === 0 && emptyState) {
    return <tbody>{emptyState}</tbody>;
  }

  const totalHeight = items.length * rowHeight;
  const visibleItemCount = Math.ceil(containerHeight / rowHeight);
  
  // Render a few extra items above and below to prevent flashing
  const overscan = 5;
  
  let startIndex = Math.floor(scrollTop / rowHeight) - overscan;
  startIndex = Math.max(0, startIndex);
  
  let endIndex = startIndex + visibleItemCount + (overscan * 2);
  endIndex = Math.min(items.length, endIndex);

  const visibleItems = items.slice(startIndex, endIndex);
  const paddingTop = startIndex * rowHeight;
  const paddingBottom = totalHeight - (endIndex * rowHeight);

  return (
    <tbody className={className} style={{ display: 'block', height: containerHeight, overflowY: 'auto' }} ref={containerRef}>
      {paddingTop > 0 && (
        <tr style={{ height: paddingTop, display: 'block' }} />
      )}
      
      {visibleItems.map((item, i) => {
        const actualIndex = startIndex + i;
        return renderRow(item, actualIndex);
      })}
      
      {paddingBottom > 0 && (
        <tr style={{ height: paddingBottom, display: 'block' }} />
      )}
    </tbody>
  );
}
