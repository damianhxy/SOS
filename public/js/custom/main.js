/*global $*/
$(function() {
    $(".nav-link[href='" + location.pathname + "']").addClass("active");
    
    $(".btn-file :file").change(function() {
        var name = $(this).get(0).files.item(0).name
        $("#uploadForm [name='name']").val(name);
        $("#uploadName").val(name);
    });
});