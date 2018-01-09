'use strict';
/* eslint max-len:0 */
module.exports = (data) =>
  `<!DOCTYPE html>
    <html>
      <head>
        <title>loadbalancer proxy</title>
      </head>
      <script>
        window.addEventListener(\'message\', function (event) {
            if (event.data !== \'getResponse\') { 
                return; 
            };  
            event.source.postMessage(JSON.stringify({loadbalancer: {response: ${JSON.stringify(data)}}}),\'*\');}
            ,false);
      </script>
      <body></body>
      </html>`;
