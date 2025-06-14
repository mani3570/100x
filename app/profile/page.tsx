"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Pencil,
  Trash2,
  Save,
  X,
  Mail,
  User,
  Check,
  RefreshCw,
  Heart,
  Star,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import type { Application } from "@/types";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";

type Profile = {
  id?: string;
  user_id: string;
  email: string;
  public_email: boolean;
  participant_type?: string;
};

type ProfileApplication = Application & {
  stars: number;
  isStarred: boolean;
  creator_user_id?: string;
};

type Team = {
  id: string;
  name: string;
  members: {
    id: string;
    user_id: string;
    email: string;
  }[];
};

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [myApplications, setMyApplications] = useState<ProfileApplication[]>(
    []
  );
  const [likedApplications, setLikedApplications] = useState<
    ProfileApplication[]
  >([]);
  const [commentedApplications, setCommentedApplications] = useState<
    ProfileApplication[]
  >([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<
    "my" | "liked" | "commented" | "teams"
  >("my");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedUserId, setEditedUserId] = useState("");
  const [editedPublicEmail, setEditedPublicEmail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && profile) {
      // If user is not approved, redirect to waiting approval page
      if (!profile.approved) {
        router.replace("/waiting-approval");
        return;
      }

      setMyProfile(profile);
      setEditedUserId(profile.user_id || "");
      setEditedPublicEmail(profile.public_email || false);
      fetchUserData();
    } else if (!user && !loading) {
      router.push("/login");
    }
  }, [user, profile, loading, router]);

  const fetchUserData = async () => {
    if (!profile?.id) return;

    try {
      // Fetch user's stars first to get the starred application IDs
      const { data: userStars } = await supabase
        .from("stars")
        .select("application_id")
        .eq("user_id", profile.id);

      const starredAppIds = userStars?.map((star) => star.application_id) || [];

      // Fetch user's applications
      const { data: apps, error: appsError } = await supabase
        .from("applications")
        .select(
          `
          *,
          stars(count),
          creator:profiles!creator_id(
            id,
            user_id,
            team_id
          )
        `
        )
        .in(
          "creator_id",
          (
            await supabase
              .from("profiles")
              .select("id")
              .eq("team_id", profile.team_id)
          ).data?.map((p) => p.id) || []
        )
        .order("created_at", { ascending: false });

      if (appsError) throw appsError;

      const formattedApps = apps.map((app: any) => ({
        ...app,
        stars: app.stars[0]?.count || 0,
        isStarred: starredAppIds.includes(app.id),
        creator_user_id: app.creator?.user_id,
      }));

      setMyApplications(formattedApps);

      // Fetch starred applications
      const { data: stars, error: starsError } = await supabase
        .from("stars")
        .select(
          `
          application_id,
          application:applications(
            *,
            stars(count),
            creator:profiles!creator_id(user_id)
          )
        `
        )
        .eq("user_id", profile.id);

      if (starsError) throw starsError;

      const formattedStars = stars
        .filter((star: any) => star.application)
        .map((star: any) => ({
          ...star.application,
          stars: star.application.stars[0]?.count || 0,
          creator_user_id: star.application.creator?.user_id,
          isStarred: true,
        }));

      setLikedApplications(formattedStars);

      // Fetch commented applications with star counts
      const { data: comments, error: commentsError } = await supabase
        .from("comments")
        .select(
          `
          application_id,
          application:applications(
            *,
            stars(count),
            creator:profiles!creator_id(user_id)
          )
        `
        )
        .eq("user_id", profile.id);

      if (commentsError) throw commentsError;

      const uniqueApps = Array.from(
        new Map(
          comments
            .filter((comment: any) => comment.application)
            .map((comment: any) => [
              comment.application.id,
              {
                ...comment.application,
                stars: comment.application.stars[0]?.count || 0,
                creator_user_id: comment.application.creator?.user_id,
                isStarred: starredAppIds.includes(comment.application.id),
              },
            ])
        ).values()
      );

      setCommentedApplications(uniqueApps);

      // Fetch user's teams
      const { data: userTeams, error: teamsError } = await supabase
        .from("profiles")
        .select(
          `
          id,
          user_id,
          email,
          team_id,
          team_name
        `
        )
        .eq("team_id", profile.team_id);

      if (teamsError) throw teamsError;

      const formattedTeams = [
        {
          id: profile.team_id || "",
          name: userTeams?.[0]?.team_name || "Unnamed Team",
          members:
            userTeams?.map((member) => ({
              id: member.id,
              user_id: member.user_id,
              email: member.email,
            })) || [],
        },
      ];

      setTeams(formattedTeams);
    } catch (error) {
      console.error("Error fetching user data:", error);
      toast({
        title: "Error",
        description: "Failed to load user data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          user_id: editedUserId,
          public_email: editedPublicEmail,
        })
        .eq("id", profile.id)
        .select();

      if (error) {
        console.error("Update error:", error);
        throw error;
      }

      // Update local state with the returned data
      if (data && data.length > 0) {
        setMyProfile({
          ...myProfile!,
          user_id: data[0].user_id,
          public_email: data[0].public_email,
        });
      }

      setIsEditing(false);

      // Force refresh the page to update the auth context
      window.location.reload();

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Add this function to handle the toggle change
  const handlePublicEmailToggle = (checked: boolean) => {
    setEditedPublicEmail(checked);
  };

  const handleStar = async (id: string, isStarred: boolean) => {
    if (!user || !profile) {
      toast({
        title: "Authentication required",
        description: "Please sign in to star applications",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the application details first
      const { data: application, error: appError } = await supabase
        .from("applications")
        .select("title, creator_id")
        .eq("id", id)
        .single();

      if (appError) throw appError;

      // Check if user is the creator
      const isOwnApplication = application.creator_id === profile.id;

      if (!isStarred) {
        // Add star
        const { error: starError } = await supabase
          .from("stars")
          .insert({ application_id: id, user_id: profile.id });

        if (starError) throw starError;

        // Only create notification if not starring own application
        if (!isOwnApplication) {
          const { data: existingNotification } = await supabase
            .from("notifications")
            .select()
            .eq("user_id", application.creator_id)
            .eq("type", "star")
            .eq("application_id", id)
            .eq("action_user_id", profile.id)
            .single();

          if (!existingNotification) {
            const { error: notificationError } = await supabase
              .from("notifications")
              .insert({
                user_id: application.creator_id,
                type: "star",
                title: "New Star",
                message: `${profile.user_id} starred your application "${application.title}"`,
                application_id: id,
                action_user_id: profile.id,
                read: false,
              });

            if (notificationError) throw notificationError;
          }
        }
      } else {
        // Remove star
        const { error } = await supabase
          .from("stars")
          .delete()
          .eq("application_id", id)
          .eq("user_id", profile.id);

        if (error) throw error;
      }

      // Update all relevant states based on active tab
      if (activeTab === "my") {
        setMyApplications((apps) =>
          apps.map((app) =>
            app.id === id
              ? {
                  ...app,
                  stars: isStarred ? app.stars - 1 : app.stars + 1,
                  isStarred: !isStarred,
                }
              : app
          )
        );
      } else if (activeTab === "liked") {
        setLikedApplications((apps) =>
          apps.map((app) =>
            app.id === id
              ? {
                  ...app,
                  stars: isStarred ? app.stars - 1 : app.stars + 1,
                  isStarred: !isStarred,
                }
              : app
          )
        );
      } else if (activeTab === "commented") {
        setCommentedApplications((apps) =>
          apps.map((app) =>
            app.id === id
              ? {
                  ...app,
                  stars: isStarred ? app.stars - 1 : app.stars + 1,
                  isStarred: !isStarred,
                }
              : app
          )
        );
      }
    } catch (error) {
      console.error("Error updating star:", error);
      toast({
        title: "Error",
        description: "Failed to update star",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!user) {
    return null;
  }

  if (loading && !profile) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 p-6 bg-card rounded-lg border mb-6">
          <Avatar className="h-24 w-24">
            <AvatarImage
              className="rounded-full"
              src={user?.image || ""}
              alt={user?.email || ""}
              referrerPolicy="no-referrer"
            />
            <AvatarFallback>
              <User className="h-12 w-12" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">
                {editedUserId || user?.email?.split("@")[0]}
              </h1>
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Profile
                </Button>
              )}
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {user?.email}
              {!isEditing && (
                <Badge
                  variant={profile?.public_email ? "default" : "secondary"}
                  className="ml-2"
                >
                  {profile?.public_email ? "Public" : "Private"}
                </Badge>
              )}
            </p>
            {profile?.participant_type && (
              <Badge variant="outline" className="ml-2">
                {profile.participant_type}
              </Badge>
            )}
          </div>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedUserId(profile?.user_id || "");
                    setEditedPublicEmail(profile?.public_email || false);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveProfile}>
                  <Save className="h-4 w-4 mr-1" />
                  Save Changes
                </Button>
              </>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleLogout}>
                logout
              </Button>
            )}
          </div>
        </div>

        {/* Edit Profile Form - Moved outside the header */}
        {isEditing && (
          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userId">Username</Label>
                <Input
                  id="userId"
                  value={editedUserId}
                  onChange={(e) => setEditedUserId(e.target.value)}
                  placeholder="Enter your username"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="public-email"
                  checked={editedPublicEmail}
                  onCheckedChange={setEditedPublicEmail}
                />
                <Label htmlFor="public-email">Show email publicly</Label>
              </div>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <Button
            variant={activeTab === "my" ? "default" : "outline"}
            onClick={() => setActiveTab("my")}
          >
            Team Submissions
          </Button>
          <Button
            variant={activeTab === "liked" ? "default" : "outline"}
            onClick={() => setActiveTab("liked")}
          >
            Starred ({likedApplications.length})
          </Button>
          <Button
            variant={activeTab === "commented" ? "default" : "outline"}
            onClick={() => setActiveTab("commented")}
          >
            Commented ({commentedApplications.length})
          </Button>
          <Button
            variant={activeTab === "teams" ? "default" : "outline"}
            onClick={() => setActiveTab("teams")}
          >
            My Team
          </Button>
        </div>

        {/* Applications Grid */}
        {activeTab !== "teams" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {(activeTab === "my"
              ? myApplications
              : activeTab === "liked"
                ? likedApplications
                : commentedApplications
            ).map((app) => (
              <Link
                href={`/applications/${app.id}`}
                key={app.id}
                className="block group"
              >
                {activeTab === "my" && (
                  <Card className="overflow-hidden w-full max-w-[280px] justify-self-center transition-transform hover:scale-[1.02] h-[370px]">
                    <div className="flex flex-col h-full">
                      <div className="relative w-full aspect-square max-h-[200px]">
                        <Image
                          src={app.screenshot_url}
                          alt={app.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="p-3 flex flex-col h-[200px]">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-semibold text-base line-clamp-1 group-hover:text-primary">
                            {app.title}
                          </p>
                          <Badge
                            variant={
                              app.status === "approved"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {app.status}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {app.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs px-2 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {app.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{app.tags.length - 3}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                          {app.description}
                        </p>

                        <div className="flex justify-between items-center mt-auto">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                handleStar(app.id, app.isStarred);
                              }}
                              className={app.isStarred ? "text-[#ef5a3c]" : ""}
                            >
                              <Star
                                className={`h-4 w-4 mr-1 ${
                                  app.isStarred ? "fill-[#ef5a3c]" : ""
                                }`}
                              />
                              <span className="text-xs">{app.stars}</span>
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              window.open(app.url, "_blank");
                            }}
                            className="text-xs"
                          >
                            Visit <ExternalLink className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {(activeTab === "liked" || activeTab === "commented") && (
                  <Card className="overflow-hidden w-full max-w-[280px] justify-self-center transition-transform hover:scale-[1.02] h-[370px]">
                    <div className="flex flex-col h-full">
                      <div className="relative w-full aspect-square max-h-[200px]">
                        <Image
                          src={app.screenshot_url}
                          alt={app.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="p-3 flex flex-col h-[200px]">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-semibold text-base line-clamp-1 group-hover:text-primary">
                            {app.title}
                          </p>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/users/${app.creator_user_id}`}
                              className="text-xs text-muted-foreground hover:text-primary whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{app.creator_user_id}
                            </Link>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {app.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs px-2 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {app.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{app.tags.length - 3}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                          {app.description}
                        </p>

                        <div className="flex justify-between items-center mt-auto">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault();
                                handleStar(app.id, app.isStarred);
                              }}
                              className={app.isStarred ? "text-[#ef5a3c]" : ""}
                            >
                              <Star
                                className={`h-4 w-4 mr-1 ${
                                  app.isStarred ? "fill-[#ef5a3c]" : ""
                                }`}
                              />
                              <span className="text-xs">{app.stars}</span>
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              window.open(app.url, "_blank");
                            }}
                            className="text-xs"
                          >
                            Visit <ExternalLink className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Teams Grid */}
        {activeTab === "teams" && (
          <div className="grid grid-cols-1 gap-6">
            {teams.map((team) => (
              <Card key={team.id} className="p-6">
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <h3 className="text-2xl font-semibold">{team.name}</h3>
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      {team.members.length} members
                    </Badge>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-medium">Team Members</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {team.members.map((member) => (
                        <Link href={`/users/${member.user_id}`} key={member.id}>
                          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                @{member.user_id}
                              </div>
                              <div className="text-sm text-muted-foreground truncate">
                                {member.email}
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {((activeTab === "my" && myApplications.length === 0) ||
          (activeTab === "liked" && likedApplications.length === 0) ||
          (activeTab === "commented" && commentedApplications.length === 0) ||
          (activeTab === "teams" && teams.length === 0)) && (
          <div className="text-center text-muted-foreground py-12">
            No {activeTab === "teams" ? "teams" : "applications"} found in this
            category.
          </div>
        )}
      </div>
    </div>
  );
}
