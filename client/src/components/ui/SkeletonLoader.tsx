import React from 'react';

interface SkeletonProps {
  className?: string;
  shape?: 'rect' | 'circle';
  animate?: boolean;
}

export function SkeletonLoader({ className = '', shape = 'rect', animate = true }: SkeletonProps) {
  const baseClasses = `bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20`;
  const shapeClasses = shape === 'circle' ? 'rounded-full' : '';
  const animateClasses = animate ? 'animate-pulse' : '';

  return (
    <div className={`${baseClasses} ${shapeClasses} ${animateClasses} ${className}`} />
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <div className={`card p-4 bg-white relative overflow-hidden ${className}`}>
      <SkeletonLoader className="w-1/3 h-4 mb-2" />
      <SkeletonLoader className="w-2/3 h-8 mb-1" />
      <SkeletonLoader className="w-1/2 h-3" />
    </div>
  );
}

interface SkeletonChartProps {
  className?: string;
}

export function SkeletonChart({ className = '' }: SkeletonChartProps) {
  return (
    <div className={`bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] ${className}`}>
      <div className="flex justify-between items-center mb-5">
        <SkeletonLoader className="w-1/4 h-5" />
        <SkeletonLoader className="w-1/6 h-5" />
      </div>
      <SkeletonLoader className="w-full h-64" />
    </div>
  );
}
