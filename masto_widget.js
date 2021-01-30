/**
* Mastowidget, copyright (C)2019-2021 Nicholas Killewald
* https://github.com/CaptainSpam/mastowidget
*
* This file is distributed under the terms of the MIT License,
* a copy of which can be found in the repository listed above.
*/

// The account URL is the baseline.  We can get to statuses relative to here.
const accountUrl = '';
const statusesUrl = `${accountUrl}/statuses?limit=20`;

// This is the base element in which we're putting this.  It will become a
// jQuery thingy when the document loads.
var baseElem = undefined;

var authorData = {};
var postData = [];

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
    wrapper.find('*').each(function(index, childElem) {
        sanitizeAttributesFromElement(childElem);
    });

    // Now cleaned, return the jQuery thingy (cloned, because there's no telling
    // what's going to happen to the contents of the wrapper once it falls out
    // of scope).
    return elem.clone();
}

function sanitizeAttributesFromElement(elem) {
    // For each attribute in the element...
    $.each(elem.attributes, function(index, attribute) {
        const attrName = attribute.name;
        const attrVal = attribute.value;

        // Remove any of the on* attributes, which might trigger JS.  Also,
        // remove any attribute that starts with "javascript:", as that's
        // HELLA suspicious.
        if(attrName.startsWith('on') || attrVal.startsWith('javascript:')) {
            elem.removeAttribute(attrName);
        }
    });
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
    <div class="mw_loading">${loadingText}</div>
    <div class="mw_error"></div>
    <div class="mw_mainblock">
        <div class="mw_userblock">
            <a rel="nofollow noopener noreferrer">
                <div class="mw_avatar"></div>
            </a>
            <div class="mw_userinfo">
                <div class="mw_userdisplayname"></div>
                <div class="mw_summary"></div>
            </div>
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

    var userUrl = '';
    var userDisplayName = '';
    var postUrl = '';
    if(postData['reblog']) {
        postUrl = postData['reblog']['url'];
        userUrl = postData['reblog']['account']['url'];
        userDisplayName = postData['reblog']['account']['display_name'];
    } else {
        postUrl = postData['url'];
        userUrl = postData['account']['url'];
        userDisplayName = postData['account']['display_name'];
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
                    <a rel="nofollow noopener noreferrer" href="${userUrl}">${userDisplayName}</a>
                </div>
                <!-- <div class="mw_entry_in_reply_to">Replying to [NAME AND LINK]</div> -->
                <div class="mw_entry_date">
                    <a rel="nofollow noopener noreferrer" href="${postUrl}" title="${date}">${date.toLocaleString()}</a>
                </div>
            </div>
        </div>
        <div class="mw_entry_content"></div>
        <div class="mw_media_container"></div>
    </div>`);

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
    return $(`
    <div class="mw_media_item">
        <a rel="nofollow noopener noreferrer" href="${url}">
            <img src="${previewUrl}" title="${description}" alt="${description}">
        </a>
    </div>`);
}

function fetchAccountData() {
    // While it looks like an account entity is returned with every status,
    // we're just going to grab it now so we know what the user is.  What's
    // returned with individual statuses might be things like the original
    // author of a boosted status or whatnot.
    $.get(accountUrl, '', function(data, textStatus, jqXHR) {
        // Here comes author data!  And it's in nifty JSON format, too!
        authorData = extractAuthorDataFromJson(data);

        fetchStatuses();
    }).fail(genericFetchError);
}

function fetchStatuses() {
    // Status time!
    $.get(statusesUrl, '', function(data, textStatus, jqXHR) {
        // Post data should just be an array of, well, post data.
        postData = data;

        finalizePosts();
    }).fail(genericFetchError);
}


function extractAuthorDataFromJson(json) {
    const authorData = {};

    // Man, this is SO much nicer than guessing at what the RSS feed has...
    authorData['displayName'] = json['display_name'];
    authorData['uri'] = json['url'];
    authorData['avatar'] = json['avatar'];
    authorData['summary'] = json['note'];

    // TODO: Is this always true?  I don't see anything in Mastodon's output
    // that would imply otherwise.
    authorData['summaryIsHtml'] = true;

    return authorData;
}

function showError(errorText) {
    setMode(baseElem, 'error');
    const error = baseElem.find('.mw_error');
    error.text(errorText);
}

function genericFetchError(data) {
    // Chances are the browser already dumped an error to console.log in this
    // case, so we don't need to do that here.
    showError('There was some sort of problem reading your data.  If you\'re sure you typed it in right, maybe that server doesn\'t allow cross-domain Javascript widgets access to the feed (Mastodon instances in particular might deny access by default)?');
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

function showAuthorData() {
    baseElem.find('.mw_avatar').parent().attr('href', authorData['uri']);
    baseElem.find('.mw_avatar').css('background-image', 'url("' + authorData['avatar'] + '")');

    var aElem = makeLink(authorData['uri'], authorData['displayName']);
    baseElem.find('.mw_userdisplayname').append(aElem);

    if(authorData['summaryIsHtml']) {
        baseElem.find('.mw_summary').append(sanitizeHtmlToJQueryThingy(authorData['summary']));
    } else {
        baseElem.find('.mw_summary').text(authorData['summary']);
    }
}

function showAllPosts() {
    var entries = baseElem.find('.mw_contentblock');

    // Later, we'll want to be able to update the content (i.e. adding more
    // entries after a timeout if more have been added at the source), but for
    // now, let's always assume a complete wipe.
    entries.empty();

    $.each(postData, function(index, data) {
        // Build the skeleton post HTML.
        const entryElem = constructPost(data);

        // Then, toss sanitized content in.
        entryElem.find('.mw_entry_content').append(sanitizeHtmlToJQueryThingy(data['content']));

        // TODO: This isn't how in-reply-to works, fix this.
        /*
        if('in-reply-to' in data) {
            curElem = $(document.createElement('div'));
            curElem.addClass('mw_in_reply_to');

            aElem = makeLink(data['conversation'], '(part of a conversation)');
            curElem.append(aElem);
            entryElem.append(curElem);
        }
        */

        // If we've got any media to attach, attach it to the appropriate
        // container.
        const media = data['media_attachments'];

        // Keep track of how much media we've added.  If there's none, or all
        // the attachments are things we can't handle, remove the media
        // container to the DOM tree.
        var mediaAdded = 0;
        const mediaContainer = entryElem.find('.mw_media_container');

        if(media && media.length > 0) {
            $.each(media, function(mediaIndex, mediaData) {
                // TODO: Other media types?  We're just ignoring anything that
                // isn't an image for now.
                if(mediaData['type'] === 'image') {
                    mediaContainer.append(constructImageAttachment(mediaData['url'], mediaData['preview_url'], mediaData['description']));
                    mediaAdded++;
                } else {
                    console.warn(`Don't know how to handle media of type '${mediaData['type']}', ignoring...`);
                }
            });
        }

        if(mediaAdded === 0) {
            mediaContainer.remove();
        }

        // Finally, toss the block on to the end!
        entries.append(entryElem);

        // And add a separator.
        entries.append($(document.createElement('hr')));
    });

    // And knock out that last separator.
    entries.find('hr').last().remove();
}

function finalizePosts() {
    console.log('Found ' + postData.length + ' posts.');

    // Stop the long-loading timeout, if it's still waiting.
    clearTimeout(longLoadingTimeout);

    setMode('display');
    showAuthorData();
    showAllPosts();
}

$(document).ready(function() {
    // As this is an iframe, we want the base to be the overall body element.
    baseElem = $('body');
    constructPage();
    setMode('loading');

    baseElem.css('visibility', 'visible');

    // So, where do we start?
    if(!accountUrl) {
        showError('The accountUrl variable isn\'t defined or is empty; you\'ll need to look that up to use this widget.');
        console.error('accountUrl isn\'t defined or is empty; you\'ll need to look that up to use this.  It\'s right near the top of the masto_widget.js file.');
        return;
    } else {
        // Quick!  To AJAX!  Start this whole thing in motion!
        fetchAccountData();
    }
});

