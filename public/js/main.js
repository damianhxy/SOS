/*global $*/
/*global location*/
$(function() {
    console.info("main.js is running");
    $(".nav-link[href='" + location.pathname + "']").addClass("active");
    
    $("#uploadForm :file").change(function() {
        var name = $(this).get(0).files.item(0).name
        $("#uploadForm [name='name']").val(name);
        $("#uploadName").val(name);
    });
});