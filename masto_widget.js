/**
* Mastowidget, copyright (C)2019-2022 Nicholas Killewald
* https://github.com/CaptainSpam/mastowidget
*
* This file is distributed under the terms of the MIT License,
* a copy of which can be found in the repository listed above.
*/

// The account URL is the baseline.  We can get to statuses relative to here.
// Specifically, this is the API endpoint to access an account's info.  The
// usual format will be 'https://<INSTANCE>/api/v1/accounts/<ID>'.  You'll need
// to figure out your numeric ID on the instance to use this.
const accountUrl = '';
const statusesUrl = `${accountUrl}/statuses?limit=20`;

// This is the base element in which we're putting this.  It will become a
// jQuery thingy when the document loads.
var baseElem = undefined;

const loadingText = 'Loading...';
var longLoadingTimeout;
const longLoadingText = 'Loading (in theory)...';
const longLoadingDelay = 5000;

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
    <div class="mw_entry" id="${id}">
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
            </div>
        </div>
        <div class="mw_entry_container">
            <div class="mw_spoiler">
                <span class="mw_spoiler_text"></span>
                <button class="mw_spoiler_button">Show more</button>
            </div>
            <div class="mw_spoilerable">
                <div class="mw_entry_content"></div>
                <div class="mw_poll_container"></div>
            </div>
        </div>
        <div class="mw_media_container"></div>
        <div class="mw_info_bar"></div>
    </div>`);

    toReturn.find('.mw_entry_userdisplayname').append(userALink);

    const avatar = toReturn.find('.mw_entry_avatar');
    if(postData['reblog'] === null) {
        toReturn.find('.mw_entry_boosting').remove();
        avatar.parent().attr('href', postData['account']['url']);
        avatar.css('background-image', 'url("' + postData['account']['avatar'] + '")');
    } else {
        avatar.parent().attr('href', postData['reblog']['account']['url']);
        avatar.css('background-image', 'url("' + postData['reblog']['account']['avatar'] + '")');
    }

    return toReturn;
}

function constructImageAttachment(url, previewUrl, description) {
    const toReturn = $(`
    <div class="mw_media_item">
        <a rel="nofollow noopener noreferrer" href="${url}">
            <img src="${previewUrl}">
        </a>
    </div>`);

    if(description) {
        toReturn.find('img').attr('title', description).attr('alt', description);
    }

    return toReturn;
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

function renderUserData(userData) {
    var aElem = makeAuthorLink(userData);
    baseElem.find('.mw_userdisplayname').text('Toots by ').append(aElem);

    baseElem.find('.mw_summary').append(sanitizeHtmlToJQueryThingy(userData['note']));
}

function renderAllPosts(statuses) {
    if(statuses.length === 0) {
        // If there's nothing here at all, put up a helpful message.
        showError('It looks like there aren\'t any public toots on this account.');
        return;
    }

    var entries = baseElem.find('.mw_contentblock');

    // Later, we'll want to be able to update the content (i.e. adding more
    // entries after a timeout if more have been added at the source), but for
    // now, let's always assume a complete wipe.
    entries.empty();

    for(const data of statuses) {
        // Build the skeleton post HTML.
        const entryElem = constructPost(data);

        // Then, toss sanitized content in.
        const content = sanitizeHtmlToJQueryThingy(data['content']);
        const contentElem = entryElem.find('.mw_entry_content');
        contentElem.append(content);

        // If there's any emoji in the data, it (hopefully) means anything
        // mentioned is in use somewhere in the post.
        replaceEmojisInJQueryThingy(content, data['emojis']);

        // Now, if there's a spoiler/sensitive flag, handle that, too.
        if(data['sensitive']) {
            // Hide the actual entry.
            const spoilerableElem = entryElem.find('.mw_spoilerable');
            spoilerableElem.toggle(false);

            if(data['spoiler_text']) {
                // Add in some spoiler text, if applicable.  This can be empty.
                // This is not HTML, as far as I can tell.
                const spoilerText = entryElem.find('.mw_spoiler_text');
                spoilerText.text(data['spoiler_text']);

                // Emojify it, too.
                replaceEmojisInJQueryThingy(spoilerText, data['emojis']);
            }

            // Then, make the button do something.
            const spoilerButton = entryElem.find('.mw_spoiler_button');
            spoilerButton.click((event) => {
                // Specifically, toggle the text...
                spoilerableElem.toggle();

                // ...and, update the button's text.
                spoilerButton.text(contentElem.is(':visible') ? 'Show less' : 'Show more');
            });
        } else {
            // If it's not that sensitive, remove the spoiler block entirely.
            entryElem.find('.mw_spoiler').remove();
        }

        // If we've got any media to attach, attach it to the appropriate
        // container.
        const media = data['media_attachments'];

        // Keep track of how much media we've added.  If there's none, or all
        // the attachments are things we can't handle, remove the media
        // container from the DOM tree.
        var mediaAdded = 0;
        const mediaContainer = entryElem.find('.mw_media_container');

        if(media && media.length > 0) {
            for(const mediaData of media){
                // TODO: Other media types?  We're just ignoring anything that
                // isn't an image for now.
                if(mediaData['type'] === 'image') {
                    mediaContainer.append(constructImageAttachment(mediaData['url'], mediaData['preview_url'], mediaData['description']));
                    mediaAdded++;
                } else {
                    console.warn(`Don't know how to handle media of type '${mediaData['type']}', ignoring...`);
                }
            };
        }

        if(mediaAdded === 0) {
            mediaContainer.remove();
        }

        // Is there a poll?  Toss that in, too.
        const pollContainer = entryElem.find('.mw_poll_container');
        if(data['poll']) {
            const poll = data['poll'];

            // Funny, polls don't have titles.  Well, I guess the entire toot
            // can be considered its title, but still, we can charge right on
            // ahead with placing the poll options in place.
            const optionContainer = $('<ul class="mw_poll_option_container"></ul>');
            for(const option of poll['options']) {
                // Get the percent.  This COULD be undefined, according to the
                // API.  I don't quite know how you'd do that from the
                // interface, but it's apparently possible to be in a situation
                // where an API user is unaware of the vote counts.
                const percent = option['votes_count'] !== null
                    ? ((option['votes_count'] / poll['votes_count']) * 100).toLocaleString(undefined, {maximumFractionDigits:2})
                    : undefined;

                const optionElem = $('<li></li>');
                if(option['votes_count'] !== null) {
                    optionElem.attr('title', `${option['votes_count']} vote${option['votes_count'] !== 1 ? 's' : ''}`);
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

        // Now, do we have any replies, boosts, or favorites to report?
        const infoBar = entryElem.find('.mw_info_bar');
        if(data['replies_count'] > 0 || data['reblogs_count'] > 0 || data['favourites_count'] > 0) {
            // Yes!  Let's add them in!
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
            // No!  Remove the infobar itself!
            infoBar.remove();
        }

        // Finally, toss the block on to the end!
        entries.append(entryElem);

        // And add a separator.
        entries.append($(document.createElement('hr')));
    };

    // And knock out that last separator.
    entries.find('hr').last().remove();
}

function renderData(userData, statuses) {
    // Stop the long-loading timeout, if it's still waiting.
    clearTimeout(longLoadingTimeout);

    setMode('display');
    renderUserData(userData);
    renderAllPosts(statuses);
}

function fetchData() {
    setSpinnerVisible(true);

    // jQuery can make promises (as per 3.0), so let's start making promises!
    Promise.all([$.get(accountUrl), $.get(statusesUrl)])
        .then(([userData, statuses]) => {
            console.log('Fetched ' + statuses.length + ' posts.');
            renderData(userData, statuses);
        }).catch(genericFetchError)
        .finally(() => {
            // Once a fetch is complete, the spinner should probably go away in
            // any case.
            setSpinnerVisible(false);
        });
}

$(document).ready(() => {
    // As this is an iframe, we want the base to be the overall body element.
    baseElem = $('.mw_body');
    constructPage();
    setMode('loading');

    baseElem.css('visibility', 'visible');

    // So, where do we start?
    if(!accountUrl) {
        showError('The accountUrl variable isn\'t defined or is empty; you\'ll need to look that up to use this widget.');
        console.error('accountUrl isn\'t defined or is empty; you\'ll need to look that up to use this.  The variable is defined right near the top of the masto_widget.js file.');
        return;
    }

    fetchData();
});

