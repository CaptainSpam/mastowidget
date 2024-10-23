/**
* Mastowidget, copyright (C)2019-2023 Nicholas Killewald
* https://github.com/CaptainSpam/mastowidget
*
* This file is distributed under the terms of the MIT License,
* a copy of which can be found in the repository listed above.
*/

// Your all-purpose configgy stuff.
const config = {
    /**
     * The base instance URL.  This is where your instance is; for example,
     * 'https://mastodon.social'.  If the protocol (http or https) is absent,
     * this script will assume you meant https.  I'd be surprised if there's all
     * that many instances out there that aren't on https.
     *
     * This may be empty if userName has a full domain in it.  However, if for
     * some reason you ARE on an instance that doesn't use https, you'll need
     * to give that URL here and use the username-only format for userName.
     */
    instanceUrl: '',
    /**
     * Your user name, as a string.  This is either your named account on the
     * instance (i.e. @username) OR your fully qualified username-and-instance-
     * domain combo (i.e. @username@instance.social).  You can leave off the
     * leading @ if you want.
     *
     * If this has a full domain name in it, this takes precedence over
     * instanceUrl.  If not, instanceUrl is required.
     */
    userName: '',

    /**
     * Whether or not the posts auto-reload.  If false, whatever's loaded at
     * first will be all what's displayed and no new posts will be loaded.
     */
    refreshPosts: true,
    /**
     * The refresh rate, in ms.  By default, this is 5 minutes.  In ms.
     */
    refreshPostsRateMs: 1000 * 60 * 5,

    /**
     * Options to filter toots out of fetching.  Yes, all of these CAN be
     * combined if, for whatever reason, you want to only display pinned toots
     * with media attachments that are neither replies nor boosts.
     */
    fetchOptions: {
        /** If true, don't display any toots that are replies to other toots. */
        exclude_replies: false,
        /** If true, don't display any reblogs (boosts, retoots, etc). */
        exclude_reblogs: false,
        /**
         * If true, ONLY display toots with media attachments.  Be very careful
         * with this; chances are you don't want this unless you're pointing to
         * a media-heavy account, but if you do, keep in mind that as of this
         * writing, not all media types supported by Mastodon itself (including
         * audio and video) are supported in Mastowidget yet.  I'm working on
         * it.
         */
        only_media: false,
        /** If true, ONLY display pinned toots. */
        pinned: false,
        /**
         * The number of toots to fetch (and, by extension, display).  This is
         * clamped to a max of 40, both by this code and the Mastodon server
         * API.  Defaults to 20.  If invalid (undefined, null, NaN, zero, or
         * negative), goes back to said default of 20.
         */
        limit: 20,
    }
};

function normalizeConfigUrl(url) {
    if(!url) {
        return undefined;
    }

    var normalizedUrl = url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `https://${url}`;

    if(normalizedUrl.endsWith('/')) {
        normalizedUrl = normalizedUrl.substring(0, normalizedUrl.length - 1);
    }

    return normalizedUrl;
}

// Check over the username for validity and extract the actual name part and the
// instance URL from it if appropriate.  Imma just go ahead and abuse JavaScript
// function definitions to get this to do what I want.
const [normalizedUserName, normalizedInstanceUrl, isUserNameValid] = (() => {
    // The username is valid if it:
    //
    // 1. Has no @s (name as given, use config.instanceUrl).
    // 2. Has exactly one @ as the first character (name as given with that @
    //    chopped off, use config.instanceUrl).
    // 3. Has exactly one @ as anything but the last character (name as whatever
    //    is before the @, extract instance URL).
    // 4. Has exactly two @s, one as the first character and one as anything
    //    between the THIRD character and the character before the last (name as
    //    whatever is between the @s, extract instance URL).
    //
    // Any other case is invalid (@ at the end, @ at the start even after
    // chopping the first off, too many @s).
    var ats = 0;
    for(const c of config.userName) {
        if(c === '@') {
            ats++;
        }
    }

    const firstAtIndex = config.userName.indexOf('@');

    if(ats === 0) {
        // Case 1: No @s.
        return [config.userName, normalizeConfigUrl(config.instanceUrl), true];
    }

    if(ats === 1) {
        if(firstAtIndex === 0) {
            // Case 2: One @, at the start.
            return [config.userName.substring(1), normalizeConfigUrl(config.instanceUrl), true];
        }

        if(firstAtIndex < config.userName.length - 1) {
            // Case 3: One @, anywhere but the end.
            return [config.userName.substring(0, firstAtIndex), `https://${config.userName.substring(firstAtIndex + 1)}`, true];
        }
    }

    if(ats === 2 && firstAtIndex === 0) {
        const secondAtIndex = config.userName.indexOf('@', 1);
        if(secondAtIndex > 1 && secondAtIndex < config.userName.length - 1) {
            // Case 4: Two @s in reasonable positions.
            return [config.userName.substring(1, secondAtIndex), `https://${config.userName.substring(secondAtIndex + 1)}`, true];
        }
    }

    // Nothing else matched, so this username must be invalid.
    return [config.userName, normalizeConfigUrl(config.instanceUrl), false];
})();

const apiBase = `${normalizedInstanceUrl}/api/v1/`;

// The URL from which we'll fetch data for a single status at a time.  This is
// for finding the parent toot and its author when we're viewing a toot marked
// as a reply.  Attach the numeric ID of a status to the end of this.
const singleStatusUrl = `${apiBase}/statuses/`;

var refreshPostsTimeout;

// This is the base element in which we're putting this.  It will become a
// jQuery thingy when the document loads.
var baseElem = undefined;

const loadingText = 'Loading...';
var longLoadingTimeout;
const longLoadingText = 'Loading (in theory)...';
const longLoadingDelay = 5000;

var hasLoadedOnce = false;

function makeLink(href, text) {
    // Standard stuff that should go on every link.
    const aElem = $(document.createElement('a'));
    aElem.attr('rel', 'nofollow noopener noreferrer');
    if(href) {
        aElem.attr('href', href);
    }

    if(text) {
        aElem.text(text);
    }

    return aElem;
}

function makeAuthorLink(authorData) {
    const aLink = makeLink(authorData['url']);
    aLink.text(authorData['display_name']);
    replaceEmojisInJQueryThingy(aLink, authorData['emojis']);
    return aLink;
}

function sanitizeHtmlToJQueryThingy(html) {
    // Build a JQuery thingy out of the incoming HTML.
    const elem = $(html);

    // If jQuery can't parse it (that is, it's not really HTML), bail out and
    // return it as text.
    if(!elem) {
        // Though, wrap it in a span, just to be polite.
        const toReturn = $(document.createElement('span'));
        toReturn.text(html);
        return toReturn;
    }

    // Wrap it up in something so we can process it.
    const wrapper = $(document.createElement('div'));
    wrapper.append(elem);

    // Next, remove all script elems inside.  None of THAT nonsense, now.
    wrapper.find('script').remove();

    // On each sub-element...
    wrapper.find('*').each((index, childElem) => {
        sanitizeAttributesFromElement(childElem);
    });

    // Now cleaned, return the jQuery thingy (cloned, because there's no telling
    // what's going to happen to the contents of the wrapper once it falls out
    // of scope).
    return elem.clone();
}

function sanitizeAttributesFromElement(elem) {
    // For each attribute in the element...
    for(const attribute of elem.attributes) {
        const attrName = attribute.name;
        const attrVal = attribute.value;

        // Remove any of the on* attributes, which might trigger JS.  Also,
        // remove any attribute that starts with "javascript:", as that's
        // HELLA suspicious.
        if(attrName.startsWith('on') || attrVal.startsWith('javascript:')) {
            elem.removeAttribute(attrName);
        }
    };
}

function replaceEmojisInJQueryThingy(jq, emojis) {
    if(emojis && emojis.length > 0) {
        // Because I'm feeling paranoid, build up a map to ensure the emoji are
        // unique in the list.  This is working entirely by replaceAll, so we
        // don't want any mishaps regarding firing twice on the same string.
        const emojiMap = new Map();
        for(const emojiData of emojis) {
            emojiMap.set(emojiData['shortcode'], emojiData['url']);
        }

        for(const [shortcode, url] of emojiMap) {
            const emojiCode = `:${shortcode}:`;
            jq.html((index, oldHtml) => oldHtml.replaceAll(emojiCode, `<img class="mw_emoji" src="${url}" alt="${emojiCode}" title="${emojiCode}">`));
        }
    }
}

function longLoadingMessage() {
    baseElem.find('.mw_loading').text(longLoadingText);
}

function constructPage() {
    // This just builds up the HTML such that we only need one div on the page
    // to begin with.
    baseElem.empty();

    // Make sure the base is a mw_container!
    baseElem.addClass('mw_container');

    const allOfTheHtml = $(`
    <div class="mw_spinner">
        <svg viewbox="0 0 26 26">
            <use xlink:href="#spinner"></use>
        </svg>
    </div>
    <div class="mw_loading">${loadingText}</div>
    <div class="mw_error"></div>
    <div class="mw_mainblock">
        <div class="mw_userblock">
            <div class="mw_userdisplayname"></div>
            <div class="mw_summary"></div>
            <hr>
        </div>
        <div class="mw_contentblock"></div>
        <div class="mw_footerblock">
            Powered by <a rel="nofollow noopener noreferrer" href="https://github.com/CaptainSpam/mastowidget">Mastowidget</a>
        </div>
    </div>`);

    // Also, let's add in a timeout to add the "(in theory)" text back in if
    // things are taking too long.
    longLoadingTimeout = setTimeout(longLoadingMessage, longLoadingDelay);

    baseElem.append(allOfTheHtml);
}

function constructPost(postData) {
    // A post has some common elements.  Other stuff is added afterward.
    const id = postData['id'];
    const date = new Date(postData['created_at']);
    const editDate = postData['edited_at'] ? new Date(postData['edited_at']) : date;

    var postUrl = '';
    var userALink = undefined;
    if(postData['reblog']) {
        postUrl = postData['reblog']['url'];
        userALink = makeAuthorLink(postData['reblog']['account']);
    } else {
        postUrl = postData['url'];
        userALink = makeAuthorLink(postData['account']);
    }

    const toReturn = $(`
    <div class="mw_entry" data-id="${id}">
        <div class="mw_entry_userblock">
            <a rel="nofollow noopener noreferrer">
                <div class="mw_entry_avatar"></div>
            </a>
            <div class="mw_entry_userinfo">
                <div class="mw_entry_boosting">Boosting</div>
                <div class="mw_entry_userdisplayname">
                </div>
                <div class="mw_entry_date">
                    <a rel="nofollow noopener noreferrer" href="${postUrl}" title="${date}">${date.toLocaleString()}</a>
                </div>
                <div class="mw_entry_edit_date">
                </div>
            </div>
        </div>
        <div class="mw_entry_container">
            <div class="mw_reply_container"></div>
            <div class="mw_spoiler">
                <span class="mw_spoiler_text"></span>
                <button class="mw_spoiler_button">Show post</button>
            </div>
            <div class="mw_spoilerable">
                <div class="mw_entry_content"></div>
                <div class="mw_poll_container"></div>
            </div>
        </div>
        <div class="mw_media_container"></div>
        <div class="mw_info_bar"></div>
        <hr />
    </div>`);

    // Remember the last time this was edited (which may be the time it was
    // created if edited_at isn't defined); this will be necessary for potential
    // refreshes later.
    toReturn.data('lastEdited', editDate.getTime());
    // Also remember when this was created as a number, mostly so that during
    // sorting we don't need to keep making new Date objects;
    toReturn.data('createdAt', date.getTime());

    toReturn.find('.mw_entry_userdisplayname').append(userALink);

    if(postData['edited_at']) {
        toReturn.find('.mw_entry_edit_date').append(`(last edited ${new Date(postData['edited_at']).toLocaleString()})`);
    } else {
        toReturn.find('.mw_entry_edit_date').remove();
    }

    const avatar = toReturn.find('.mw_entry_avatar');
    if(postData['reblog'] === null) {
        toReturn.find('.mw_entry_boosting').remove();
        avatar.parent().attr('href', postData['account']['url']);
        avatar.css('background-image', 'url("' + postData['account']['avatar'] + '")')
            .attr('title', `@${postData['account']['acct']}`)
            .attr('alt', `User icon for ${postData['account']['display_name']}`);
    } else {
        avatar.parent().attr('href', postData['reblog']['account']['url']);
        avatar.css('background-image', 'url("' + postData['reblog']['account']['avatar'] + '")')
            .attr('title', `@${postData['reblog']['account']['acct']}`)
            .attr('alt', `User icon for ${postData['reblog']['account']['display_name']}`);
    }

    return toReturn;
}

function constructImageAttachment(mediaData, sensitive) {
    const toReturn = $(`
    <div class="mw_media_item">
        <a rel="nofollow noopener noreferrer" href="${mediaData['url']}">
            <img src="${mediaData['preview_url']}">
        </a>
    </div>`);

    if(mediaData['description']) {
        toReturn.find('img').attr('title', mediaData['description'])
            .attr('alt', mediaData['description']);
    }

    if(mediaData['blurhash'] && blurhash) {
        // It's blurhash time!  Use the metadata to hopefully get width and
        // height; it'll get resized by style.  But, if the metadata doesn't
        // exist, go with a default, I guess?  The metadata really should exist.
        var width = '32';
        var height = '32';

        const meta = mediaData['meta'];

        if(meta && meta['small'] && meta['small']['width'] 
            && meta['small']['height']) {
            width = meta['small']['width'];
            height = meta['small']['height'];
        }

        // The blurhash stuff should already have been declared by inclusion
        // earlier in the containing iframe HTML.  Hopefully.
        blurhash.decodePromise(mediaData['blurhash'], width, height)
            .then(blurhashImgData => {
                // Hi, welcome back from promiseworld.  We're going to load this
                // as an img rather than a canvas because we don't know the
                // dimensions of the container for sure at this point.  The user
                // may be using their own styles, and we're trying to keep this
                // simple with regards to sizing things correctly on the page.
                return blurhash.getImageDataAsImageWithOnloadPromise(
                    blurhashImgData,
                    width,
                    height);
            })
            .then(blurImg => {
                // Fiddle with the output a bit.  The blurhash code attaches
                // width and height properties to the img, but we want styles to
                // override so we don't need to calculate all this out in JS.
                $(blurImg).addClass('mw_media_blurhash')
                    .attr('width', '')
                    .attr('height', '');
                toReturn.prepend(blurImg);

                // Add in the spoiler button HERE, now that we know the img
                // element exists.
                if(sensitive) {
                    const button = $('<button class="mw_media_spoiler_button"><span>Sensitive content</span></button>');
                    button.click((event) => {
                        button.toggle();
                        // The blur image needs to go away, too.
                        $(blurImg).toggle();
                        toReturn.find('a').css('visibility', 'visible');
                    });
                    toReturn.prepend(button);
                } else {
                    // If this ISN'T spoilered, we still need a point at which
                    // the blur goes away, else it'll show up behind images with
                    // transparencies.
                    const actualImg = toReturn.find('img');
                    if(actualImg[0].complete) {
                        // In THEORY, the blurhash routine should finish up
                        // well before any network operation that would load the
                        // actual image.  In practice, however, there's things
                        // like caches and whatnot that might bring the image up
                        // first.  If the image is already present before the
                        // blurhash promises resolve (in a non-spoilered
                        // situation), just remove the blurhash image from play.
                        $(blurImg).toggle();
                    } else {
                        // If the image hasn't finished loading yet, wait.
                        actualImg.on('load', (event) => {
                            $(blurImg).toggle();
                        });
                    }
                }
            });
    }

    if(sensitive) {
        // If this is sensitive, mark it hidden (so it still takes up space).
        toReturn.find('a').css('visibility', 'hidden');
    }

    return toReturn;
}

function constructVideoAttachment(mediaData, sensitive) {
    const toReturn = $(`
    <div class="mw_media_item">
        <video controls src="${mediaData['url']}" poster="${mediaData['preview_url']}">
            <a rel="nofollow noopener noreferrer" href="${mediaData['url']}">Open video</a>
        </video>
    </div>`);

    if(mediaData['description']) {
        toReturn.find('video').attr('title', mediaData['description'])
            .attr('alt', mediaData['description']);
    }

    if(mediaData['type'] === 'gifv') {
        // A gifv!  The video should, therefore, loop and start out muted.  We
        // would also make it auto-play, except Mastowidget lives in an iframe,
        // and things get very dicey with autoplay permissions in iframes, for
        // reasonably good reasons.
        toReturn.find('video').attr('muted', true).attr('loop', true);
    }

    // The blurhash part only comes into play if this is sensitive.  The video
    // element doesn't have the same sort of rendering complete events and
    // properties that img does.
    if(mediaData['blurhash'] && blurhash && sensitive) {
        var width = '32';
        var height = '32';

        const meta = mediaData['meta'];

        if(meta && meta['small'] && meta['small']['width']
            && meta['small']['height']) {
            width = meta['small']['width'];
            height = meta['small']['height'];
        }

        blurhash.decodePromise(mediaData['blurhash'], width, height)
            .then(blurhashImgData => {
                return blurhash.getImageDataAsImageWithOnloadPromise(
                    blurhashImgData,
                    width,
                    height);
            })
            .then(blurImg => {
                $(blurImg).addClass('mw_media_blurhash')
                    .attr('width', '')
                    .attr('height', '');
                toReturn.prepend(blurImg);

                const button = $('<button class="mw_media_spoiler_button"><span>Sensitive content</span></button>');
                button.click((event) => {
                    button.toggle();
                    $(blurImg).toggle();
                    toReturn.find('video').css('visibility', 'visible');
                });
                toReturn.prepend(button);
            });
    }

    if(sensitive) {
        // If sensitive, hide it.
        toReturn.find('video').css('visibility', 'hidden');
    }

    return toReturn;
}

function constructAudioAttachment(mediaData, sensitive) {
    const toReturn = $(`
    <div class="mw_media_item">
        <audio controls src="${mediaData['url']}">
            <a rel="nofollow noopener noreferrer" href="${mediaData['url']}">Open audio</a>
        </audio>
    </div>`);

    if(mediaData['description']) {
        toReturn.find('audio').attr('title', mediaData['description'])
            .attr('alt', mediaData['description']);
    }

    // Now here's the tricky part: We don't have anything to blur for audio.  I
    // mean, it's audio.  That's sort of to be expected.  So for the sensitive
    // bits, let's just make it a plain ol' button.
    if(sensitive) {
        const button = $('<button class="mw_media_spoiler_button_audio"><span>Sensitive content</span></button>');
        const actualAudio = toReturn.find('audio');

        actualAudio.toggle(false);
        button.click((event) => {
            button.toggle();
            actualAudio.toggle(true);
        });

        toReturn.prepend(button);
    }

    return toReturn;
}

function updateInfoBar(data, entryElem) {
    const infoBar = entryElem.find('.mw_info_bar');

    // First, scrub anything in the bar.
    infoBar.empty();

    // Then, see if there's any replies, boosts, or favorites to report.
    if(data['replies_count'] > 0 || data['reblogs_count'] > 0 || data['favourites_count'] > 0) {
        // There are!  Let's add them in!  First, make sure the infobar is
        // actually visible.
        infoBar.toggle(true);
        if(data['replies_count'] > 0) {
            infoBar.append(constructInfoBarIcon('replies', data['replies_count']));
        }
        if(data['reblogs_count'] > 0) {
            infoBar.append(constructInfoBarIcon('boosts', data['reblogs_count']));
        }
        if(data['favourites_count'] > 0) {
            infoBar.append(constructInfoBarIcon('favorites', data['favourites_count']));
        }
    } else {
        // No!  Hide the infobar!
        infoBar.toggle(false);
    }

}

function constructInfoBarIcon(type, count) {
    var title = '';
    if(type === 'replies') {
        title = `${count} Repl${count > 1 ? 'ies' : 'y'}`;
    } else if(type === 'boosts') {
        title = `${count} Boost${count > 1 ? 's' : ''}`;
    } else if(type === 'favorites') {
        title = `${count} Favorite${count > 1 ? 's' : ''}`;
    }

    return $(`
    <div class="mw_info_element" title="${title}">
        <svg viewBox="0 0 24 24">
            <use xlink:href="#${type}"></use>
        </svg>
        ${count}
    </div>`);
}

function showError(errorText) {
    setMode('error');
    const error = baseElem.find('.mw_error');
    error.text(errorText);
}

function genericFetchError() {
    // Chances are the browser already dumped an error to console.log in this
    // case, so we don't need to do that here.
    showError('There was some sort of problem fetching data.  If you\'re sure you have the right account API URL, maybe there\'s an issue with the instance at the moment?');
}

function setMode(modeString) {
    // Our modes of choice today are:
    //
    // "loading"
    // "display"
    // "error"
    if(modeString === 'loading') {
        baseElem.find('.mw_loading').toggle(true);
        baseElem.find('.mw_mainblock').toggle(false);
        baseElem.find('.mw_error').toggle(false);
    } else if(modeString === 'display') {
        baseElem.find('.mw_loading').toggle(false);
        baseElem.find('.mw_mainblock').toggle(true);
        baseElem.find('.mw_error').toggle(false);
    } else if(modeString === 'error') {
        baseElem.find('.mw_loading').toggle(false);
        baseElem.find('.mw_mainblock').toggle(false);
        baseElem.find('.mw_error').toggle(true);
    }
}

function setSpinnerVisible(visible) {
    // This has to remain separate from setMode, as there can be situations
    // where the spinner is spinning but it isn't in the full-panel "Loading"
    // mode.
    baseElem.find('.mw_spinner').toggle(visible);
}

function populateElementWithPostData(data, entryElem) {
    // Wait!  Don't touch that dial!  Is this a boost (a "reblog", as the API
    // likes to call it)?  If so, the REAL content will be in there.  As far as
    // I can tell, a reblog won't have any "base" content (that is,
    // data['content'] will be an empty string), as I don't see anything in the
    // UI to allow for "boost and also add my own text", and that makes sense
    // because now that I type that out, that sounds more like just a reply than
    // a boost.
    const activeData = data['reblog'] ?? data;

    // Then, toss sanitized content in.
    const content = sanitizeHtmlToJQueryThingy(activeData['content']);
    const contentElem = entryElem.find('.mw_entry_content');
    contentElem.append(content);

    // If there's any emoji in the data, it (hopefully) means anything mentioned
    // is in use somewhere in the post.
    replaceEmojisInJQueryThingy(content, activeData['emojis']);

    // Was this a reply?  If so, fill out the reply block.
    if(activeData['in_reply_to_id']) {
        const replyElem = entryElem.find('.mw_reply_container');

        // Note that this will have a reply ID but no reply data if there was a
        // problem fetching said data.  Adapt!
        if(activeData['in_reply_to_data']) {
            const replyData = activeData['in_reply_to_data'];
            const postLink = makeLink(replyData['uri'], 'a post');
            const userLink = makeLink(replyData['account']['url']);
            userLink.attr('title', `@${replyData['account']['acct']}`);
            const userIcon = $('<div class="mw_reply_avatar"></div>');
            userIcon.css('background-image', 'url("' + replyData['account']['avatar'] + '")')
                .attr('alt', `User icon for ${replyData['account']['display_name']}`);

            userLink.append(userIcon, replyData['account']['display_name']);

            replyElem.append('In reply to ', postLink, ' by ', userLink, ':');
        } else {
            replyElem.text('In reply to something (error fetching parent post?):');
        }

    } else {
        entryElem.find('.mw_reply_container').remove();
    }

    // Now, if there's a spoiler/sensitive flag, handle that, too.  Note that
    // the API doesn't differentiate between a post being marked sensitive and
    // *media* being marked sensitive, but the main web UI *does*.  That is, if
    // any media is marked sensitive in the post, we'll see the sensitive flag
    // as true.
    if(activeData['sensitive']) {
        // Hide the actual entry.
        const spoilerableElem = entryElem.find('.mw_spoilerable');
        spoilerableElem.toggle(false);

        if(activeData['spoiler_text']) {
            // Add in some spoiler text, if applicable.  This can be empty.
            // This is not HTML, as far as I can tell.
            const spoilerText = entryElem.find('.mw_spoiler_text');
            spoilerText.text(activeData['spoiler_text']);

            // Emojify it, too.
            replaceEmojisInJQueryThingy(spoilerText, activeData['emojis']);
        }

        // Then, make the button do something.
        const spoilerButton = entryElem.find('.mw_spoiler_button');
        spoilerButton.click((event) => {
            // Specifically, toggle the text...
            spoilerableElem.toggle();

            // ...and, update the button's text.
            spoilerButton.text(contentElem.is(':visible') ? 'Hide post' : 'Show post');
        });
    } else {
        // If it's not that sensitive, remove the spoiler block entirely.
        entryElem.find('.mw_spoiler').remove();
    }

    // If we've got any media to attach, attach it to the appropriate container.
    const media = activeData['media_attachments'];

    // Keep track of how much media we've added.  If there's none, or all
    // the attachments are things we can't handle, remove the media
    // container from the DOM tree.
    var mediaAdded = 0;
    const mediaContainer = entryElem.find('.mw_media_container');

    if(media && media.length > 0) {
        for(const mediaData of media){
            switch(mediaData['type']) {
                case 'image':
                    mediaContainer.append(
                        constructImageAttachment(
                            mediaData, 
                            activeData['sensitive']));
                    mediaAdded++;
                    break;
                case 'video':
                case 'gifv':
                    // "gifv", in Mastodon, seems to refer to any video that
                    // doesn't have an audio track.  Also, Mastodon converts
                    // "real" animated GIFs into MP4s on the backend.  As such,
                    // both video and gifv types are handled as video 
                    // attachments, with minor differences covered when we make
                    // the element.
                    mediaContainer.append(
                        constructVideoAttachment(
                            mediaData,
                            activeData['sensitive']));
                    mediaAdded++;
                    break;
                case 'audio':
                    mediaContainer.append(
                        constructAudioAttachment(
                            mediaData,
                            activeData['sensitive']));
                    mediaAdded++;
                    break;
                default:
                    console.warn(`Don't know how to handle media of type '${mediaData['type']}', ignoring...`);
            }
        };
    }

    if(mediaAdded === 0) {
        mediaContainer.remove();
    }

    // Is there a poll?  Toss that in, too.
    const pollContainer = entryElem.find('.mw_poll_container');
    if(activeData['poll']) {
        const poll = activeData['poll'];

        // Funny, polls don't have titles.  Well, I guess the entire toot
        // can be considered its title, but still, we can charge right on
        // ahead with placing the poll options in place.
        const totalVotes = poll['votes_count'];

        const optionContainer = $('<ul class="mw_poll_option_container"></ul>');
        for(const option of poll['options']) {
            // Get the percent.  This COULD be undefined, according to the
            // API.  I don't quite know how you'd do that from the
            // interface, but it's apparently possible to be in a situation
            // where an API user is unaware of the vote counts.
            const votesCount = option['votes_count'];

            // If there's no votes yet (or totalVotes is somehow just falsy),
            // just count everything as 0% to avoid NaNs.
            const percent = !totalVotes
                ? 0
                : votesCount !== null
                    ? ((votesCount / totalVotes) * 100).toLocaleString(undefined, {maximumFractionDigits:2})
                    : undefined;

            const optionElem = $('<li></li>');
            if(votesCount !== null) {
                optionElem.attr('title', `${votesCount} vote${votesCount !== 1 ? 's' : ''}`);
            }

            // Build up the title area.
            const optionTitleArea = $('<div class="mw_poll_option_title"></div>');
            optionElem.append(optionTitleArea);

            // The percent hovers over to the left.  Stylistically, it
            // should be a fixed width so all the option names line up.
            // This becomes an inline-block.
            optionTitleArea.append($(`<span class="mw_poll_option_percent">${percent !== undefined ? percent + '%' : '??%'}</span>`));

            // Then, add the text right afterward.
            const optionText = $('<span class="mw_poll_option_text"></span>');

            // If I'm getting this right, options are always plaintext from
            // an HTML standpoint, but they can have emoji tags.
            optionText.text(option['title']);
            replaceEmojisInJQueryThingy(optionText, poll['emojis']);
            optionTitleArea.append(optionText);

            // Then, put a bar in.
            // TODO: Mimic Mastodon's interface and add another style to
            // whatever option is in the lead (or multiples if a tie)?
            // That'd require another pass to mark which option(s) is(are)
            // in the lead.
            const bar = $('<div class="mw_poll_option_bar"></div>');
            bar.css('width', percent !== undefined ? percent + '%' : '1%');
            optionElem.append(bar);

            optionContainer.append(optionElem);
        }

        pollContainer.append(optionContainer);
    } else {
        // If there's no poll, just remove the container.
        pollContainer.remove();
    }

    // The infobar is handled elsewhere; see renderAllPosts for details.
    return entryElem;
}

function insertPostElementIntoList(entries, newElem) {
    newDate = newElem.data('createdAt');
    const entryList = entries.find('.mw_entry');

    if(entryList.length === 0) {
        // The easiest case: This is the first entry.
        entries.append(newElem);
    } else {
        // Let's sort by createdAt.  In theory the ID should be a good enough
        // sorting key, but eh, let's not push it.  To that end, let's pull out
        // our our CS 101 binary search memories and have at it!
        var startIndex = 0;
        var endIndex = entryList.length - 1;

        while(startIndex < endIndex) {
            // Compare the createdAts.  I hope they aren't equal.
            const curIndex = startIndex + Math.floor((endIndex - startIndex) / 2);
            if(newDate > $(entryList[curIndex]).data('createdAt')) {
                // Lower!
                endIndex = curIndex - 1;
            } else {
                // Higher!  Or equal, I guess.
                startIndex = curIndex + 1;
            }
        }

        // And we have a winner!  This entry (startIndex and endIndex are the
        // same at this point) is the closest already existing, so let's put it
        // in place!
        if(newDate < $(entryList[startIndex]).data('createdAt')) {
            // Added in after this entry (earlier dates are further down).
            newElem.insertAfter(entryList[startIndex]);
        } else {
            // Added in before this entry.
            newElem.insertBefore(entryList[startIndex]);
        }
    }
}

function removeStrayPosts(entries, idList) {
    entries.find('.mw_entry').each((index, childElem) => {
        const elem = $(childElem);

        if(!idList.includes(elem.attr('data-id'))) {
            elem.remove();
        }
    });
}

function renderUserData(userData) {
    var aElem = makeAuthorLink(userData);
    baseElem.find('.mw_userdisplayname').empty().text('Toots by ').append(aElem);

    baseElem.find('.mw_summary').empty().append(sanitizeHtmlToJQueryThingy(userData['note']));
}

function renderAllPosts(statuses) {
    if(statuses.length === 0) {
        // If there's nothing here at all, put up a helpful message.
        showError('It looks like there aren\'t any public toots on this account.');
        return;
    }

    // Gather up all the IDs.  We'll need these to know if anything currently
    // being displayed needs to be dropped (that is, if we're displaying
    // something with an ID that isn't in the list), as well as know what IDs we
    // need to create anew..
    const idList = statuses.map((data) => data['id']);

    const entries = baseElem.find('.mw_contentblock');

    for(const data of statuses) {
        // First off, do we have a post with this ID already?
        const existingElem = entries.find(`[data-id=${data['id']}]`);

        if(existingElem.length === 0) {
            // This post doesn't exist yet.  Make a new one and toss it in.
            const newElem = constructPost(data);
            insertPostElementIntoList(
                entries, 
                populateElementWithPostData(data, newElem));
            updateInfoBar(data, newElem);
        } else if(existingElem.length === 1) {
            // Just so we don't wind up recreating a whole dang DOM tree for an
            // element if we don't need to, check to see if the post has been
            // edited since the element's existed.
            const postEditTime = new Date(data['edited_at'] ?? data['created_at']).getTime();

            // It seems like it'd make more sense to just check if postEditTime
            // is GREATER than existingElem's data, rather than not-equals like
            // this.  But, if the time changed in ANY way, we'll want to update
            // regardless.
            if(postEditTime !== existingElem.data('lastEdited')) {
                // It's different!  Replace this with new data!
                const updatedElem = constructPost(data);
                existingElem.replaceWith(populateElementWithPostData(data, updatedElem));
                updateInfoBar(data, updatedElem);
            } else {
                // Otherwise, just update the info bar.  New counts for
                // replies/boosts/favorites don't change edited_at, so we need
                // to update it manually.
                updateInfoBar(data, existingElem);
            }
        } else {
            console.warn(`There are multiple existing elements (${existingElem.length}) for a toot with an ID of ${data['id']}!  This shouldn't happen!`);
        }
    };

    // Now that we've got things added, let's consider removing things.  Any
    // toot that's on the page but doesn't exist in what we just fetched needs
    // to go away.
    removeStrayPosts(entries, idList);
}

function renderData(userData, statuses) {
    setMode('display');
    renderUserData(userData);
    renderAllPosts(statuses);
}

function makeStatusFetchUrl(userData) {
    const fetchOptions = config['fetchOptions'] ?? {};

    var baseUrl = `${apiBase}accounts/${userData['id']}/statuses?`;

    // Always put a limit in, just in case.  And clean it up, also just in case.
    var limit = fetchOptions['limit'] ?? 20;
    if(isNaN(limit) || limit <= 0) {
        limit = 20;
    }
    limit = Math.min(limit, 40);

    baseUrl = `${baseUrl}limit=${limit}`;

    // Season with flags.
    if(fetchOptions['exclude_replies']) {
        baseUrl = `${baseUrl}&exclude_replies=1`;
    }
    if(fetchOptions['exclude_reblogs']) {
        baseUrl = `${baseUrl}&exclude_reblogs=1`;
    }
    if(fetchOptions['only_media']) {
        baseUrl = `${baseUrl}&only_media=1`;
    }
    if(fetchOptions['pinned']) {
        baseUrl = `${baseUrl}&pinned=1`;
    }

    return baseUrl;
}

function fetchData() {
    // Set the spinner in motion.
    setSpinnerVisible(true);

    // Stop the refresh timer, if we somehow got here with that still running.
    if(refreshPostsTimeout !== undefined) {
        clearTimeout(refreshPostsTimeout);
    }

    var accountUrl = `${apiBase}accounts/lookup?acct=${normalizedUserName}`;

    var userData = undefined;

    Promise.resolve($.get(accountUrl))
        .then((fetchedUserData) => {
            userData = fetchedUserData;
            return Promise.resolve($.get(makeStatusFetchUrl(userData)));
        }).then(async (statuses) => {
            console.log(`Fetched ${statuses.length} post${statuses.length !== 1 ? 's' : ''}.`);

            // Then, look through each status for any that are replies.  We'll
            // need to do additional fetches to get the contexts for those.
            // This will be a map of reply IDs to any number of statuses that
            // need it (a status can only be a reply to one parent, but a parent
            // can have multiple replies).
            const replyMap = new Map();
            for(const data of statuses) {
                if(data['in_reply_to_id']) {
                    const replyId = data['in_reply_to_id'];
                    if(replyMap.has(replyId)) {
                        replyMap.get(replyId).push(data);
                    } else {
                        replyMap.set(replyId, [data]);
                    }
                }

                // Same thing, but also for boosts ("reblogs").  Those can also
                // be replies, and they ALSO have their own data.  We're not
                // doing replies-to-replies yet, though.
                if(data['reblog'] && data['reblog']['in_reply_to_id']) {
                    const replyId = data['reblog']['in_reply_to_id'];
                    if(replyMap.has(replyId)) {
                        replyMap.get(replyId).push(data['reblog']);
                    } else {
                        replyMap.set(replyId, [data['reblog']]);
                    }
                }
            }


            // If there were any, start iterating and fetching some more.  Yes,
            // we do have to fetch each post individually.
            var repliesFetched = 0;
            if(replyMap.size) {
                for(const replyId of replyMap.keys()) {
                    replyStatus = await $.get(singleStatusUrl + replyId);

                    // With a reply status in hand, staple that into the status
                    // objects.  Sure, they won't be "pure" Mastodon statuss
                    // anymore, but hey.
                    if(replyStatus) {
                        repliesFetched++;
                        for(const data of replyMap.get(replyId)) {
                            data['in_reply_to_data'] = replyStatus;
                        }
                    } else {
                        console.warn(`Error fetching parent post ${replyId}, ignoring...`);
                    }
                }

                console.log(`Fetched ${repliesFetched} parent post${repliesFetched !== 1 ? 's' : ''}.`);
            }

            hasLoadedOnce = true;
            renderData(userData, statuses);
        }).catch((data) => {
            if(data) {
                switch(data['status']) {
                    case 401:
                        // This needs auth, for some reason?
                        if(!hasLoadedOnce) {
                            showError(`The instance claims that ${normalizedUserName} requires authentication to view their statuses, which this widget can't handle.`);
                        }

                        console.error(`The instance claims that ${normalizedUserName} requires authentication to view their statuses, which this widget can't handle.  This might be something you can change in settings on the Mastodon instance itself.`);
                        break;

                    case 404:
                        // Couldn't find the user in question.
                        if(!hasLoadedOnce) {
                            showError(`The instance couldn't find any user named ${normalizedUserName}.`);
                        }

                        console.error(`The instance couldn't find any user named ${normalizedUserName}.`);
                        break;

                    default:
                        // Something else happened.
                        if(!hasLoadedOnce) {
                            genericFetchError();
                        }

                        console.error('Some sort of error happened that this widget doesn\'t know how to handle.  We got this data, though:', data);
                        break;
                }
            } else {
                if(!hasLoadedOnce) {
                    genericFetchError();
                }

                console.error('Some sort of error happened that didn\'t even return useful data for debugging.');
            }

            // TODO: If this HAS loaded once, it needs some way to show that
            // this latest fetch failed, but keep the existing data around.
        }).finally(() => {
            // Once a fetch is complete, success or failure, the spinner should
            // probably go away.
            setSpinnerVisible(false);

            // Stop the long-loading timeout, if it's still waiting.
            if(longLoadingTimeout !== undefined) {
                clearTimeout(longLoadingTimeout);
            }

            // Then, start up the refresh timer, if appropriate.
            if(config.refreshPosts) {
                refreshPostsTimeout = setTimeout(fetchData, config.refreshPostsRateMs);
            }
        });
}

$(() => {
    // As this is an iframe, we want the base to be the overall body element.
    baseElem = $('.mw_body');
    constructPage();
    setMode('loading');

    baseElem.css('visibility', 'visible');

    // So, where do we start?
    if(!normalizedInstanceUrl) {
        showError('The instanceUrl config variable wasn\'t defined or is empty and the userName config variable didn\'t indicate an instance; you\'ll need to set the instance URL in one of those ways to use this widget.');
        console.error('config.instanceUrl isn\'t defined or is empty and userName doesn\'t appear to be in user@instance.social format; you\'ll need to do either of those to use this.  The variables are defined in the config const right near the top of the masto_widget.js file.');
        setSpinnerVisible(false);
        return;
    }

    if(!normalizedUserName) {
        showError('The userName config variable wasn\'t defined or is empty; you\'ll need to set that to use this widget.');
        console.error('The userName config variable wasn\'t defined or is empty; you\'ll need to set that to use this.  The variable is defined in the config const right near the top of the masto_widget.js file.');
        setSpinnerVisible(false);
        return;
    }

    if(!isUserNameValid) {
        showError('userName doesn\'t look valid; it should either be just a username or the complete user@instance.social syntax (possibly with a leading @).');
        console.error('config.userName has some problem with its formatting; valid formats are, for instance, \'user\', \'@user\', \'user@instance.social\', or \'@user@instance.social\'.');
        setSpinnerVisible(false);
        return;
    }

    // Good, we've passed all the checks, let's fetch some data!
    fetchData();
});

