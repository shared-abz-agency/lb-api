'use strict';
/* eslint max-len:0 */
module.exports = (browser, language, monetized) => {
    let strings;
    let extensionName;
    let domain;
    if (browser === 'chrome') {
        extensionName = 'ProxFlow';
        domain = 'http://proxflow.com';
    } else {
        extensionName = 'ProxTube';
        domain = 'https://proxtube.com';
    }
    if (language === 'en') {
        strings = {
            helpPart1: `We need your help to keep ${extensionName} running!`,
            helpPart2: `By using ProxPrice price comparison you support ${extensionName}.`,
            helpButton: 'Help now',
            support: `Support ${extensionName}`,
            more: 'more',
        };
    } else {
        strings = {
            helpPart1: `${extensionName} braucht deine Unterstützung um weiter zu bestehen!`,
            helpPart2: `Durch die Nutzung des ProxPrice Preisvergleich unterstützt du ${extensionName}.`,
            helpButton: 'Jetzt helfen',
            support: `Unterstütze ${extensionName}`,
            more: 'mehr',
        };
    }

    let result = `<div class="yt-alert yt-alert-default yt-alert-success proxtube-success"
     style="height:60px;position: relative;${browser === 'firefox'? 'background-color:#689948;': ''}">
      <div class="yt-alert-icon" style="width:58px; padding:10px 15px;display: table-cell;vertical-align: middle;">
      <a href="${domain}" target="_blank" ><img alt="${extensionName} Logo"
                                                           style="float:left;padding-top: 0px;height: 40px;"
                                                           src="{0}"></a>
      </div>
      <div class="yt-alert-content"
           style="padding:16px 0px;color: white; font-size: 13px;font-weight: 500;overflow: hidden;display: table-cell;width: 100%;vertical-align: middle;">
        <button class="close yt-uix-close" data-close-parent-class="yt-alert" type="button" onclick="this.parentNode.parentNode.style ='display:none'"
                style="right:2px;top:-2px;position: absolute;padding: 0;margin: 6px 0;border: none;overflow: hidden;cursor: pointer;box-shadow: none;background: no-repeat url(//s.ytimg.com/yts/imgbin/www-hitchhiker-vflot-Poj.png) -48px -971px;background-size: auto;width: 20px;height: 20px;"></button>
        <div class="yt-alert-message" style="display:table;">`

    if (monetized) {
        result += `<div style="display:table-cell; vertical-align:middle;"><p style="padding-right:8px;">${strings.support}:</p></div><div style="display:table-cell; vertical-align:middle;"><iframe scrolling="no" frameborder="0" src="https://platform.twitter.com/widgets/follow_button.html?screen_name=${extensionName}&show_count=true&show_screen_name=true&size=m&lang=${language}" style="border:none; vertical-align: middle; overflow:hidden; height:21px; width:220px;" allowtransparency="true"></iframe></div><div style="display:table-cell; vertical-align:middle;"><iframe scrolling="no" frameborder="0" src="//www.facebook.com/plugins/like.php?href=https%3A%2F%2Ffacebook.com%2F${extensionName}&amp;send=false&amp;layout=button_count&amp;width=133&amp;show_faces=false&amp;action=like&amp;colorscheme=light&amp;font&amp;height=21&amp;appId=340273122677964" style="border:none;vertical-align: middle; overflow:hidden; height:21px; width:140px;" allowtransparency="true"></iframe></div><div style="display:table-cell; vertical-align:middle;"><a href="https://proxtube.com/" target="_blank" style="color:white" id=>${strings.more}...</a></div></div></div></div>`;
    } else {
        if (browser === 'chrome') {
            result += `<div style="padding-right:12px;display:table-cell;"><p style="font-size: 15px;">${strings.helpPart1}</p><p style="font-size: 12px;font-weight: 400;">${strings.helpPart2}</p></div><div style="display:table-cell;"><a href="http://proxprice.com/" target="_blank" style="background: #FF4A45;color: #fff;padding: 7px 10px;text-decoration: none;border-radius: 5px;position:absolute;">${strings.helpButton}</a></div></div></div></div>`;
        } else {
            result += `<div style="padding-right:12px;display:table-cell; vertical-align:middle;"><p style="font-size: 15px;">${strings.helpPart1}</p><p style="font-size: 12px;font-weight: 400;">${strings.helpPart2}</p></div><div style="display:table-cell;"><a href="#" id="activateProxTubePriceComparison" style="background: #FF4A45;color: white;padding: 7px 10px;text-decoration: none;border-radius: 5px;position:absolute;">${strings.helpButton}</a></div></div></div></div>`;
        }
    }
    return JSON.stringify(result);
};
