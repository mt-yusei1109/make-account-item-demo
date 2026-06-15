{
  description = "make-account-item-demo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        formatter = pkgs.nixfmt;
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Language & package manager
            nodejs_24
            pnpm

            # Formatter & linter
            biome

            # wrangler
            wrangler

            # Nix
            nixfmt

            # Common tools
            gh
          ];
        };
      }
    );
}
