import React from 'react';

interface FocusToastProps {
  message: string | null;
}

/** 专注模式轻提示：常驻挂载，message 为空时不渲染；由父组件定时清除 */
const FocusToast: React.FC<FocusToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
      <div className="bg-foreground text-background text-sm rounded-full px-4 py-1.5 shadow-lg">
        {message}
      </div>
    </div>
  );
};

export default FocusToast;
