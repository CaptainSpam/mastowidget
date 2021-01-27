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
// All links in the widget, be they links to the posts, user, conversations, or
// links contained in the posts themselves, will be targeted to this.  In
// general, you either want "_parent" to have it take over the page itself or
// "_blank" to spawn a new browser tab.  If you have something more complex set
// up, use that target instead.  Just try not to leave it an empty string, and
// definitely don't make it "_self", as either will make it try to go to the
// iframe itself, which usually won't work.  Note that all links will open under
// rel="noopener", as that's most likely the best idea for most cases.
const baseTarget = "_blank";

var authorData = {};
var postData = [];

const loadingText = "Loading...";
var longLoadingTimeout;
const longLoadingText = "Loading (in theory)...";
var longLoadingElem;
const longLoadingDelay = 5000;

function longLoadingMessage() {
    longLoadingElem.text(longLoadingText);
}

function constructHtml(base) {
    // This just builds up the HTML such that we only need one div on the page
    // to begin with.
    base.empty();

    // Make sure the base is a mw_container!
    base.addClass("mw_container");

    var curElem = $(document.createElement("div"));
    curElem.addClass("mw_loading");
    // Loading also has the loading text baked-in.
    curElem.text(loadingText);
    base.append(curElem);

    // Also, let's add in a timeout to add the "(in theory)" text back in if
    // things are taking too long.
    longLoadingElem = curElem;
    longLoadingTimeout = setTimeout(longLoadingMessage, longLoadingDelay);

    curElem = $(document.createElement("div"));
    curElem.addClass("mw_error");
    base.append(curElem);

    // The main block has a bit more going on.
    var mainBlock = $(document.createElement("div"));
    mainBlock.addClass("mw_mainblock");

    var userBlock = $(document.createElement("div"));
    userBlock.addClass("mw_userblock");

    // We build a-tags for the text links, sure, but here we need to wrap the
    // div with an a-tag ahead of time.
    var aElem = $(document.createElement("a"));
    aElem.attr("target", baseTarget);
    aElem.attr("rel", "noopener");
    curElem = $(document.createElement("div"));
    curElem.addClass("mw_avatar");
    aElem.append(curElem);
    userBlock.append(aElem);

    var userInfo = $(document.createElement("div"));
    userInfo.addClass("mw_userinfo");

    curElem = $(document.createElement("div"));
    curElem.addClass("mw_userdisplayname");
    userInfo.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("mw_useratname");
    userInfo.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("mw_summary");
    userInfo.append(curElem);
    userBlock.append(userInfo);
    mainBlock.append(userBlock);

    curElem = $(document.createElement("div"));
    curElem.addClass("mw_contentblock");
    mainBlock.append(curElem);
    base.append(mainBlock);
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

    var aElem = $(document.createElement("a"));
    aElem.text(authorData["displayName"]);
    aElem.attr("href", authorData["uri"]);
    aElem.attr("target", baseTarget);
    aElem.attr("rel", "noopener");
    base.find(".mw_userdisplayname").append(aElem);

    const userAtName = base.find(".mw_useratname");
    aElem = $(document.createElement("a"));
    aElem.text(authorData["uri"]);
    aElem.attr("href", authorData["uri"]);
    aElem.attr("target", baseTarget);
    aElem.attr("rel", "noopener");
    userAtName.append(aElem);
    if(authorData["summaryIsHtml"]) {
        // TODO: Sanitize!
        base.find(".mw_summary").html(authorData["summary"]);
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

        var aElem = $(document.createElement("a"));
        aElem.attr("href", data["url"]);
        aElem.attr("target", baseTarget);
        aElem.attr("rel", "noopener");
        aElem.text(date);
        curElem.append(aElem);
        entryElem.append(curElem);

        // TODO: This isn't how in-reply-to works, fix this.
        if("in-reply-to" in data) {
            curElem = $(document.createElement("div"));
            curElem.addClass("mw_in_reply_to");

            aElem = $(document.createElement("a"));
            aElem.attr("href", data["conversation"]);
            aElem.attr("target", baseTarget);
            aElem.attr("rel", "noopener");
            aElem.text("(part of a conversation)");
            curElem.append(aElem);
            entryElem.append(curElem);
        }

        // Get the content and paste that in, too.  This may need more careful
        // analysis later; as it stands, content comes in as HTML, and I have to
        // dump that in to make it look right.  To that end, though, this needs
        // to be sanitized properly.  I would think Mastodon would sanitize
        // things on their side, but hey, never can be too sure, right?
        //
        // TODO: Make said sanitizing function, do the same with author summary.
        // Just removing <script> tags isn't good enough; we really should
        // remove any of the on* attributes, any attribute whose value starts
        // with "javascript:", etc.
        curElem = $(document.createElement("div"));
        curElem.addClass("mw_entry_content");
        var content = $(data["content"]);
        content.find("script").remove();
        curElem.append(content);

        // Unlike the RSS version, it looks like Mastodon already takes care of
        // rel and target="_blank" stuff.  That's handy.

        entryElem.append(curElem);

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

