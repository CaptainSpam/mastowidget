/**
* Mastowidget, copyright (C)2019-2021 Nicholas Killewald
* https://github.com/CaptainSpam/mastowidget
*
* This file is distributed under the terms of the MIT License,
* a copy of which can be found in the repository listed above.
*/

// The account URL is the baseline.  We can get to statuses relative to here.
const accountUrl = "";
const statusesUrl = `${accountUrl}/statuses?limit=20`;

// This is the ID of the element in which we're putting this.  This is the
// iframe version, so chances are what you want is "body".
const baseDiv = "body";

var authorData = {};
var postData = [];

const loadingText = "Loading...";
var longLoadingTimeout;
const longLoadingText = "Loading (in theory)...";
var longLoadingElem;
const longLoadingDelay = 5000;

function makeLink(href, text) {
    // Standard stuff that should go on every link.
    const aElem = $(document.createElement("a"));
    aElem.attr("rel", "nofollow noopener noreferrer");
    if(href) {
        aElem.attr("href", href);
    }

    if(text) {
        aElem.text(text);
    }

    return aElem;
}

function sanitizeHtmlToJQueryThingy(html) {
    // Build a JQuery thingy out of the incoming HTML.
    const elem = $(html);

    // Step one, remove all script tags.  None of THAT nonsense, now.
    elem.find("script").remove();

    // On each attribute...
    $.each(elem[0].attributes, function(index, attribute) {
        const attrName = attribute.name;
        const attrVal = attribute.value;

        // Step two, any of the on* attributes, which might trigger JS.  Also,
        // step three, any attribute that starts with "javascript:" is HELLA
        // suspicious.
        if(attrName.startsWith("on") || attrVal.startsWith("javascript:")) {
            elem.removeAttr(attrName);
        }
    });

    // Now cleaned, return the JQuery thingy.
    return elem;
}

function longLoadingMessage() {
    longLoadingElem.text(longLoadingText);
}

function constructHtml(base) {
    // This just builds up the HTML such that we only need one div on the page
    // to begin with.
    base.empty();

    // Make sure the base is a mw_container!
    base.addClass("mw_container");

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
                <div class="mw_useratname"></div>
                <div class="mw_summary"></div>
            </div>
        </div>
        <div class="mw_contentblock"></div>
    </div>`);

    // Also, let's add in a timeout to add the "(in theory)" text back in if
    // things are taking too long.
    longLoadingElem = allOfTheHtml.find('.mw_loading');
    longLoadingTimeout = setTimeout(longLoadingMessage, longLoadingDelay);

    base.append(allOfTheHtml);
}

function fetchAccountData() {
    // While it looks like an account entity is returned with every status,
    // we're just going to grab it now so we know what the user is.  What's
    // returned with individual statuses might be things like the original
    // author of a boosted status or whatnot.
    $.get(accountUrl, "", function(data, textStatus, jqXHR) {
        // Here comes author data!  And it's in nifty JSON format, too!
        authorData = extractAuthorDataFromJson(data);

        fetchStatuses();
    }).fail(genericFetchError);
}

function fetchStatuses() {
    // Status time!
    $.get(statusesUrl, "", function(data, textStatus, jqXHR) {
        // Post data should just be an array of, well, post data.
        postData = data;

        finalizePosts();
    }).fail(genericFetchError);
}


function extractAuthorDataFromJson(json) {
    const authorData = {};

    // Man, this is SO much nicer than guessing at what the RSS feed has...
    authorData["displayName"] = json["display_name"];
    authorData["uri"] = json["url"];
    authorData["avatar"] = json["avatar"];
    authorData["summary"] = json["note"];

    // TODO: Is this always true?  I don't see anything in Mastodon's output
    // that would imply otherwise.
    authorData["summaryIsHtml"] = true;

    return authorData;
}

function showError(errorText) {
    const base = $(baseDiv);
    setMode(base, "error");
    const error = base.find(".mw_error");
    error.text(errorText);
}

function genericFetchError(data) {
    // Chances are the browser already dumped an error to console.log in this
    // case, so we don't need to do that here.
    showError("There was some sort of problem reading your data.  If you're sure you typed it in right, maybe that server doesn't allow cross-domain Javascript widgets access to the feed (Mastodon instances in particular might deny access by default)?");
}

function setMode(base, modeString) {
    // Our modes of choice today are:
    //
    // "loading"
    // "display"
    // "error"
    if(modeString === "loading") {
        base.find(".mw_loading").toggle(true);
        base.find(".mw_mainblock").toggle(false);
        base.find(".mw_error").toggle(false);
    } else if(modeString === "display") {
        base.find(".mw_loading").toggle(false);
        base.find(".mw_mainblock").toggle(true);
        base.find(".mw_error").toggle(false);
    } else if(modeString === "error") {
        base.find(".mw_loading").toggle(false);
        base.find(".mw_mainblock").toggle(false);
        base.find(".mw_error").toggle(true);
    }
}

function showAuthorData(base) {
    base.find(".mw_avatar").parent().attr("href", authorData["uri"]);
    base.find(".mw_avatar").css("background-image", "url(\"" + authorData["avatar"] + "\")");

    var aElem = makeLink(authorData["uri"], authorData["displayName"]);
    base.find(".mw_userdisplayname").append(aElem);

    const userAtName = base.find(".mw_useratname");
    aElem = makeLink(authorData["uri"], authorData["uri"]);
    userAtName.append(aElem);
    if(authorData["summaryIsHtml"]) {
        base.find(".mw_summary").append(sanitizeHtmlToJQueryThingy(authorData["summary"]));
    } else {
        base.find(".mw_summary").text(authorData["summary"]);
    }
}

function showAllPosts(base) {
    var entries = base.find(".mw_contentblock");

    // Later, we'll want to be able to update the content (i.e. adding more
    // entries after a timeout if more have been added at the source), but for
    // now, let's always assume a complete wipe.
    entries.empty();

    $.each(postData, function(index, data) {
        var entryElem = $(document.createElement("div"));
        entryElem.addClass("mw_entry");
        entryElem.attr("id", data["id"]);

        var curElem;

        // The current layout is pretty simple.  Should just be a series of
        // blocks stacked on top of each other.

        // First, the date.  I'll do more conversion later, but for now, the
        // string we got for the date should be convertable to the local
        // timezone this way.  There's more stable ways to do this, I know.
        var date = new Date(data["created_at"]);
        curElem = $(document.createElement("div"));
        curElem.addClass("mw_entry_date");

        var aElem = makeLink(data["url"], date);
        curElem.append(aElem);
        entryElem.append(curElem);

        // TODO: This isn't how in-reply-to works, fix this.
        if("in-reply-to" in data) {
            curElem = $(document.createElement("div"));
            curElem.addClass("mw_in_reply_to");

            aElem = makeLink(data["conversation"], "(part of a conversation)");
            curElem.append(aElem);
            entryElem.append(curElem);
        }

        // Get the content and paste that in, too.  This may need more careful
        // analysis later; as it stands, content comes in as HTML, and I have to
        // dump that in to make it look right.  To that end, though, this needs
        // to be sanitized properly.  I would think Mastodon would sanitize
        // things on their side, but hey, never can be too sure, right?
        curElem = $(document.createElement("div"));
        curElem.addClass("mw_entry_content");
        curElem.append(sanitizeHtmlToJQueryThingy(data["content"]));

        // Unlike the RSS version, it looks like Mastodon already takes care of
        // rel and target="_blank" stuff.  That's handy.

        entryElem.append(curElem);

        // If we've got any media to attach, attach it.
        const media = data["media_attachments"];
        if(media && media.length > 0) {
            const mediaContainer = $(document.createElement("div"));
            mediaContainer.addClass("mw_media_container");

            // Keep track of how much media we've ACTUALLY added.  If all the
            // attachments are things we can't handle, don't bother adding the
            // media container to the DOM tree.
            var mediaAdded = 0;

            $.each(media, function(mediaIndex, mediaData) {
                // TODO: Other media types?  We're just ignoring anything that
                // isn't an image for now.
                if(mediaData["type"] === "image") {
                    const mediaElem = $(document.createElement("div"));
                    mediaElem.addClass("mw_media_item");

                    const aElem = makeLink(mediaData["url"]);

                    const imgElem = $(document.createElement("img"));
                    imgElem.attr("src", mediaData["preview_url"]);
                    imgElem.attr("title", mediaData["description"]);
                    imgElem.attr("alt", mediaData["description"]);

                    aElem.append(imgElem);
                    mediaElem.append(aElem);
                    mediaContainer.append(mediaElem);

                    mediaAdded++;
                } else {
                    console.warn(`Don't know how to handle media of type '${mediaData["type"]}', ignoring...`);
                }
            });

            if(mediaAdded > 0) {
                entryElem.append(mediaContainer);
            }
        }

        // Finally, toss the block on to the end!
        entries.append(entryElem);

        // And add a separator.
        entries.append($(document.createElement("hr")));
    });

    // And knock out that last separator.
    entries.find("hr").last().remove();
}

function finalizePosts() {
    console.log("Found " + postData.length + " posts.");

    // Stop the long-loading timeout, if it's still waiting.
    clearTimeout(longLoadingTimeout);

    var base = $(baseDiv);

    setMode(base, "display");
    showAuthorData(base);
    showAllPosts(base);
}

$(document).ready(function() {
    var widget = $(baseDiv);

    constructHtml(widget);
    setMode(widget, "loading");

    widget.css("visibility", "visible");

    // So, where do we start?
    if(!accountUrl) {
        showError("The accountUrl variable isn't defined or is empty; you'll need to look that up to use this widget.");
        console.error("accountUrl isn't defined or is empty; you'll need to look that up to use this.  It's right near the top of the masto_widget.js file.");
        return;
    } else {
        // Quick!  To AJAX!  Start this whole thing in motion!
        fetchAccountData();
    }
});

