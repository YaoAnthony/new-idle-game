import React from 'react';
import HTMLFlipBook from 'react-pageflip';

const Page = React.forwardRef<HTMLDivElement, any>((props, ref) => {
  return (
    <div className="demoPage bg-white border" ref={ref}>
      <h1>Page Header</h1>
      <p>{props.children}</p>
      <p>Page number: {props.number}</p>
    </div>
  );
});

export default function TestFlip() {
  return (
    <HTMLFlipBook width={300} height={400}>
      <Page number="1">Page text 1</Page>
      <Page number="2">Page text 2</Page>
      <Page number="3">Page text 3</Page>
      <Page number="4">Page text 4</Page>
    </HTMLFlipBook>
  );
}
