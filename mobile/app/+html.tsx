import { type PropsWithChildren } from "react";

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Web-only override: remove the unwanted white divider/header separator */}
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              /* React Native Web "View" divider that shows as a white bar with a light grey bottom border */
              div[style*="border-bottom-color: rgb(216, 216, 216)"],
              div[style*="border-bottom-color: rgb(216,216,216)"] {
                border-bottom-width: 0px !important;
                border-bottom-style: solid !important;
                border-bottom-color: transparent !important;
                background-color: transparent !important;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

