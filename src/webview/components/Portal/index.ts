import { createPortal } from 'react-dom';

function Portal({
  children
}: any) {
  return createPortal(children, document.body);
}
export default Portal;
