import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** id of an element rendered outside the (hidden) tab, so the content stays visible on every ImgSentry tab. */
  hostId: string;
  children: React.ReactNode;
}

/**
 * Renders its children inside the element with the given id.
 * If that element does not exist (for example in a standalone preview) the children are rendered in place.
 */
export const PortalHost: React.FC<Props> = ({ hostId, children }) => {
  const [host, setHost] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.getElementById(hostId) : null
  );

  useEffect(() => {
    const el = document.getElementById(hostId);
    if (el !== host) setHost(el);
  }, [hostId, host]);

  return host ? createPortal(children, host) : <>{children}</>;
};

export default PortalHost;
